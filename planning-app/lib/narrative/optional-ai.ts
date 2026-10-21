import { narrativeContentSchema, type ApprovedRecommendationFact, type NarrativeContent, type NarrativeFact } from './types';

export type OptionalAiRequest = {
  requested: boolean;
  dataSharingApproved: boolean;
  firstName: string;
  concerns: string[];
  facts: NarrativeFact[];
  approvedRecommendations: ApprovedRecommendationFact[];
};
export type OptionalAiResult = { content: NarrativeContent | null; used: boolean; reason: string; model: string | null };

type AiConfig = { baseUrl: string; apiKey: string; model: string; timeoutMs: number };

/**
 * Optional AI is deliberately off by default. A Hostinger deployment can supply
 * an OpenAI-compatible endpoint and its own key; nothing here requires Manus.
 */
function configuredAi(): { config: AiConfig | null; reason: string } {
  if (process.env.NARRATIVE_AI_ENABLED !== 'true') return { config: null, reason: 'Optional AI is disabled by runtime configuration.' };
  if (process.env.NARRATIVE_AI_DATA_SHARING_APPROVED !== 'true') return { config: null, reason: 'Optional AI has no runtime data-sharing approval.' };
  const rawUrl = process.env.NARRATIVE_AI_BASE_URL?.replace(/\/$/, '') ?? '';
  const apiKey = process.env.NARRATIVE_AI_API_KEY ?? '';
  const model = process.env.NARRATIVE_AI_MODEL?.trim() ?? '';
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') throw new Error('non-https');
  } catch { return { config: null, reason: 'Optional AI requires a configured HTTPS provider endpoint.' }; }
  if (!apiKey || !model) return { config: null, reason: 'Optional AI requires an explicit provider key and runtime model selection.' };
  const configuredTimeout = Number(process.env.NARRATIVE_AI_TIMEOUT_MS ?? 8_000);
  return { config: { baseUrl: rawUrl, apiKey, model, timeoutMs: Number.isFinite(configuredTimeout) ? Math.max(2_000, Math.min(20_000, configuredTimeout)) : 8_000 }, reason: '' };
}

function removeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

/** Do not send client account identifiers even if an advisor wrote one into a recommendation. */
function providerSafeText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
    .replace(/(?:\+?\d[\d(). -]{6,}\d)/g, '[redacted]')
    .replace(/\b(?:dob|date\s+of\s+birth)\s*[:#-]?\s*\d{4}-\d{2}-\d{2}\b/gi, '[redacted]')
    .replace(/\b(?:ssn|social\s+security|account|acct)\s*(?:number|#|no\.?)?\s*[:#-]?\s*\d[\d -]{5,}\b/gi, '[redacted]')
    .replace(/(?<![$,])\b\d{7,}\b/g, '[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

function minimalProviderPayload(input: OptionalAiRequest) {
  return {
    firstName: providerSafeText(input.firstName).replace(/[0-9$%]/g, '').slice(0, 80),
    concerns: input.concerns.map((value) => providerSafeText(value).slice(0, 80)).slice(0, 3),
    facts: input.facts.map(({ label, value }) => ({ label: providerSafeText(label), value: providerSafeText(value) })),
    approvedRecommendations: input.approvedRecommendations.map((item) => ({
      title: providerSafeText(item.title), body: providerSafeText(item.body), nextStep: item.nextStep ? providerSafeText(item.nextStep) : null,
    })).slice(0, 12),
  };
}

async function catalogHasConfiguredModel(config: AiConfig, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${config.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` }, signal });
  if (!response.ok) return false;
  const body = await response.json() as { data?: Array<{ id?: unknown }> };
  return Array.isArray(body.data) && body.data.some((entry) => entry?.id === config.model);
}

export async function generateOptionalAiNarrative(input: OptionalAiRequest): Promise<OptionalAiResult> {
  if (!input.requested) return { content: null, used: false, reason: 'Template mode was selected.', model: null };
  if (!input.dataSharingApproved) return { content: null, used: false, reason: 'Optional AI requires this generation request to confirm data-sharing approval.', model: null };
  const { config, reason } = configuredAi();
  if (!config) return { content: null, used: false, reason, model: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    // Discover at request time; a configured ID is never assumed to be available.
    if (!await catalogHasConfiguredModel(config, controller.signal)) return { content: null, used: false, reason: 'The configured optional-AI model is not present in the provider catalog.', model: null };
    const payload = minimalProviderPayload(input);
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: 'Write only JSON with letter and sections. Use ONLY supplied facts and recommendation text. Do not calculate. Do not invent figures, products, returns, dates, or guarantees. Do not give legal or tax advice; say discuss with your tax professional. Letter: 150-250 words. Every section: 2-3 sentences. Warm, confident, eighth-grade reading level.' },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return { content: null, used: false, reason: 'The optional-AI provider did not return a usable response.', model: config.model };
    const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return { content: null, used: false, reason: 'The optional-AI provider returned no narrative text.', model: config.model };
    const parsed = narrativeContentSchema.safeParse(JSON.parse(removeFence(text)));
    return parsed.success ? { content: { ...parsed.data, mode: 'OPTIONAL_AI' }, used: true, reason: '', model: config.model } : { content: null, used: false, reason: 'The optional-AI response did not match the narrative contract.', model: config.model };
  } catch {
    return { content: null, used: false, reason: 'Optional AI timed out or failed; the validated template was used instead.', model: config.model };
  } finally { clearTimeout(timer); }
}
