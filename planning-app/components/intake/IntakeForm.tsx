'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IntakeSubmitControls } from './IntakeSubmitControls';
import { StepValidationSummary } from './StepValidationSummary';
import { firstIncompleteStep, resolveStepNavigation, safeDraftStep } from '@/lib/intake/navigation';
import {
  emptyIntake,
  intakeSchema,
  IntakeData,
  validateStep,
} from '@/lib/intake/schema';
import {
  concernOptions,
  coverageOptions,
  employmentOptions,
  healthOptions,
  lifeInsuranceOptions,
  stateOptions,
  steps,
  yesNoOptions,
  yesNoUnsureOptions,
} from '@/lib/intake/fields';

type DraftResponse = {
  data: IntakeData;
  step: number;
  revision: number;
  submitted: boolean;
  csrfToken: string;
  annualUpdate?: boolean;
};

type UploadMeta = { id: string; name: string; size: number } | null;
type SaveState = 'loading' | 'saved' | 'saving' | 'error';

const riskQuestions = [
  'If your portfolio fell 20% in a year, what would you be most likely to do?',
  'How comfortable are you accepting investment volatility for the potential of long-term growth?',
  'When markets are uncertain, how likely are you to stay with a long-term plan?',
  'Which best reflects the balance you prefer between protecting principal and pursuing growth?',
  'How would you react if a diversified portfolio had a temporary loss after you retired?',
];

const riskChoices = [
  '1 — Prefer maximum stability',
  '2 — Prefer more stability than growth',
  '3 — Balance stability and growth',
  '4 — Prefer more growth than stability',
  '5 — Prefer maximum long-term growth',
];

function pathValue(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, data);
}

function setPath(data: IntakeData, path: string, value: unknown): IntakeData {
  const next = structuredClone(data) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let cursor = next;
  for (const key of keys.slice(0, -1)) {
    const existing = cursor[key];
    if (!existing || typeof existing !== 'object') cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return next as unknown as IntakeData;
}

function mergeDraft<T>(fallback: T, saved: unknown): T {
  if (Array.isArray(fallback)) return (Array.isArray(saved) ? saved : fallback) as T;
  if (!fallback || typeof fallback !== 'object') return (saved ?? fallback) as T;
  const output: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
      if (key in output) output[key] = mergeDraft(output[key], value);
    }
  }
  return output as T;
}

function formatWholeDollars(value: string) {
  const normalized = value.replace(/[$,\s]/g, '');
  if (!/^\d+$/.test(normalized)) return value;
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function readableError(response: Response, body: unknown) {
  if (body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error;
  }
  return response.status === 409 ? 'A newer change was saved in another session. Reload before saving again.' : 'We could not save your information. Please try again.';
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function Field({ label, required, help, error, controlId, labelId, children }: { label: string; required?: boolean; help?: string; error?: string; controlId?: string; labelId?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={controlId} id={labelId}>
        {label}{required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {help ? <p id={`${controlId ?? labelId}-help`} className="muted">{help}</p> : null}
      {error ? <p id={`${controlId ?? labelId}-error`} className="error" role="alert">{error.startsWith('Invalid enum') ? 'Choose an answer.' : error}</p> : null}
    </div>
  );
}

function TextControl({
  data, errors, path, label, type = 'text', required, help, onChange, inputMode,
}: {
  data: IntakeData; errors: Record<string, string>; path: string; label: string; type?: 'text' | 'email' | 'tel' | 'date' | 'number'; required?: boolean; help?: string; onChange: (path: string, value: string) => void; inputMode?: 'numeric' | 'decimal' | 'tel' | 'email';
}) {
  const id = `intake-${path.replace(/[^a-z0-9]/gi, '-')}`;
  return <Field label={label} controlId={id} required={required} help={help} error={errors[path]}>
    <input id={id} className="input" required={required} aria-invalid={Boolean(errors[path])} aria-describedby={[help ? `${id}-help` : '', errors[path] ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} type={type} inputMode={inputMode} value={String(pathValue(data, path) ?? '')} onChange={(event) => onChange(path, event.target.value)} />
  </Field>;
}

function MoneyControl({ data, errors, path, label, required, help, onChange }: { data: IntakeData; errors: Record<string, string>; path: string; label: string; required?: boolean; help?: string; onChange: (path: string, value: string) => void }) {
  const id = `intake-${path.replace(/[^a-z0-9]/gi, '-')}`;
  const value = String(pathValue(data, path) ?? '');
  return <Field label={label} controlId={id} required={required} help={help ?? 'Use a whole-dollar estimate from a recent statement.'} error={errors[path]}>
    <input id={id} className="input" required={required} aria-invalid={Boolean(errors[path])} aria-describedby={`${id}-help${errors[path] ? ` ${id}-error` : ''}`} type="text" inputMode="numeric" placeholder="$0" value={value} onChange={(event) => onChange(path, event.target.value.replace(/[$,\s]/g, ''))} onBlur={() => onChange(path, formatWholeDollars(value))} />
  </Field>;
}

function PercentControl({ data, errors, path, label, required, help, onChange }: { data: IntakeData; errors: Record<string, string>; path: string; label: string; required?: boolean; help?: string; onChange: (path: string, value: string) => void }) {
  const id = `intake-${path.replace(/[^a-z0-9]/gi, '-')}`;
  return <Field label={label} controlId={id} required={required} help={help ?? 'Enter a percentage from 0 to 100.'} error={errors[path]}>
    <div className="input"><input id={id} required={required} aria-invalid={Boolean(errors[path])} aria-describedby={`${id}-help${errors[path] ? ` ${id}-error` : ''}`} type="text" inputMode="decimal" value={String(pathValue(data, path) ?? '')} onChange={(event) => onChange(path, event.target.value)} /> <span aria-hidden="true">%</span></div>
  </Field>;
}

function SelectControl({ data, errors, path, label, options, required, help, onChange }: { data: IntakeData; errors: Record<string, string>; path: string; label: string; options: { value: string; label: string }[]; required?: boolean; help?: string; onChange: (path: string, value: string) => void }) {
  const id = `intake-${path.replace(/[^a-z0-9]/gi, '-')}`;
  return <Field label={label} controlId={id} required={required} help={help} error={errors[path]}>
    <select id={id} className="input" required={required} aria-invalid={Boolean(errors[path])} aria-describedby={errors[path] ? `${id}-error` : undefined} value={String(pathValue(data, path) ?? '')} onChange={(event) => onChange(path, event.target.value)}>
      <option value="">Select an option</option>
      {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  </Field>;
}

function RadioControl({ data, errors, path, label, options, required, help, onChange }: { data: IntakeData; errors: Record<string, string>; path: string; label: string; options: { value: string; label: string }[]; required?: boolean; help?: string; onChange: (path: string, value: string) => void }) {
  const value = String(pathValue(data, path) ?? '');
  const labelId = `intake-${path.replace(/[^a-z0-9]/gi, '-')}-label`;
  return <Field label={label} labelId={labelId} required={required} help={help} error={errors[path]}>
    <div className="form-grid" role="radiogroup" aria-labelledby={labelId} aria-invalid={Boolean(errors[path])} aria-describedby={errors[path] ? `${labelId}-error` : undefined}>
      {options.map((item) => <label className="notice" key={item.value}><input type="radio" name={path} checked={value === item.value} onChange={() => onChange(path, item.value)} /> {item.label}</label>)}
    </div>
  </Field>;
}

function PersonHeading({ owner, children }: { owner: 'primary' | 'spouse'; children: ReactNode }) {
  return <section className="card"><p className="eyebrow">{owner === 'primary' ? 'You' : 'Spouse'}</p>{children}</section>;
}

function SummaryValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (Array.isArray(value)) return <>{value.length ? value.map((item, index) => <div key={index}><SummaryValue value={item} /></div>) : 'Not provided'}</>;
  if (value && typeof value === 'object') return <>{Object.entries(value as Record<string, unknown>).map(([key, item]) => <div key={key}><strong>{humanize(key)}:</strong> <SummaryValue value={item} /></div>)}</>;
  if (value === '') return <>Not provided</>;
  if (typeof value === 'string' && /Monthly|Income|Balance|Amount|Value|Benefit|Payment|Cash|Contribution|basis/i.test('')) return <>{value}</>;
  return <>{String(value ?? 'Not provided').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</>;
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function focusQuestion(path: string) {
  window.requestAnimationFrame(() => {
    const id = `intake-${path.replace(/[^a-z0-9]/gi, '-')}`;
    const riskIndex = path.startsWith('riskAnswers.') ? path.split('.')[1] : '0';
    const concernIndex = path.startsWith('rankedConcerns.') ? path.split('.')[1] : '0';
    const control = document.getElementById(id)
      ?? (path.startsWith('riskAnswers') ? document.querySelector<HTMLElement>(`[name="risk-${riskIndex}"]`) : null)
      ?? (path.startsWith('rankedConcerns') ? document.getElementById(`intake-ranked-concern-${concernIndex}`) : null)
      ?? document.querySelector<HTMLElement>('[aria-invalid="true"]');
    control?.focus();
    control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function ReviewSection({ title, detail, value, onEdit, step }: { title: string; detail: string; value: unknown; onEdit: () => void; step: number }) {
  return <section className="card"><div className="form-grid"><div><p className="eyebrow">Step {step}</p><h3>{title}</h3><p className="muted">{detail}</p></div><div><button type="button" className="button" onClick={onEdit}>Edit step {step}</button></div></div><SummaryValue value={value} /></section>;
}

export function IntakeForm() {
  const router = useRouter();
  const [data, setData] = useState<IntakeData>(emptyIntake);
  const [step, setStep] = useState(1);
  const [revision, setRevision] = useState(0);
  const [csrfToken, setCsrfToken] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [saveMessage, setSaveMessage] = useState('Opening your secure draft…');
  const [upload, setUpload] = useState<UploadMeta>(null);
  const [uploading, setUploading] = useState(false);
  const [resumeMessage, setResumeMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [ready, setReady] = useState(false);
  const [annualUpdate, setAnnualUpdate] = useState(false);

  const dataRef = useRef(data);
  const stepRef = useRef(step);
  const revisionRef = useRef(revision);
  const csrfRef = useRef(csrfToken);
  const readyRef = useRef(false);
  const dirtyRef = useRef(false);
  const changeVersionRef = useRef(0);
  const savePendingRef = useRef(false);
  const saveLoopRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { revisionRef.current = revision; }, [revision]);
  useEffect(() => { csrfRef.current = csrfToken; }, [csrfToken]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    changeVersionRef.current += 1;
  }, []);

  const setCurrentStep = useCallback((nextStep: number, persist = true) => {
    const normalized = safeDraftStep(dataRef.current, nextStep);
    if (stepRef.current === normalized) return;
    stepRef.current = normalized;
    setStep(normalized);
    if (persist) markDirty();
  }, [markDirty]);

  const loadDraft = useCallback(async () => {
    const hadOpenDraft = readyRef.current;
    setSaveState('loading');
    setSaveMessage('Opening your secure draft…');
    try {
      let response = await fetch('/api/intake/draft', { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 404) {
        response = await fetch('/api/intake/draft', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      }
      const body = await readJson(response);
      if (!response.ok || !body || typeof body !== 'object') throw new Error(readableError(response, body));
      const draft = body as DraftResponse;
      if (draft.submitted) {
        router.replace('/intake/thank-you');
        return;
      }
      const recovered = mergeDraft(emptyIntake, draft.data) as IntakeData;
      dataRef.current = recovered;
      stepRef.current = safeDraftStep(recovered, Number(draft.step) || 1);
      revisionRef.current = Number(draft.revision) || 0;
      csrfRef.current = draft.csrfToken || '';
      dirtyRef.current = false;
      setErrors({});
      setSubmissionError('');
      setData(recovered);
      setStep(stepRef.current);
      setRevision(revisionRef.current);
      setCsrfToken(csrfRef.current);
      setAnnualUpdate(Boolean(draft.annualUpdate));
      readyRef.current = true;
      setReady(true);
      setSaveState('saved');
      setSaveMessage('Saved securely');

      try {
        const uploadResponse = await fetch('/api/intake/upload', { credentials: 'same-origin', cache: 'no-store' });
        const uploadBody = await readJson(uploadResponse);
        if (uploadResponse.ok && uploadBody && typeof uploadBody === 'object' && 'upload' in uploadBody) {
          setUpload((uploadBody as { upload: UploadMeta }).upload);
        } else if (!uploadResponse.ok) {
          setSaveMessage('Draft opened. We could not check the optional upload status.');
        }
      } catch {
        setSaveMessage('Draft opened. We could not check the optional upload status.');
      }
    } catch (error) {
      if (!hadOpenDraft) {
        readyRef.current = false;
        setReady(false);
      }
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'We could not open your draft. Please retry.');
    }
  }, [router]);

  useEffect(() => { void loadDraft(); }, [loadDraft]);

  const processSave = useCallback(async (): Promise<boolean> => {
    if (!readyRef.current || !csrfRef.current) return false;
    if (saveLoopRef.current) return saveLoopRef.current;

    const loop = (async () => {
      let succeeded = true;
      while (savePendingRef.current) {
        savePendingRef.current = false;
        const snapshot = structuredClone(dataRef.current);
        const snapshotStep = stepRef.current;
        const snapshotRevision = revisionRef.current;
        const snapshotVersion = changeVersionRef.current;
        setSaveState('saving');
        setSaveMessage('Saving securely…');

        try {
          const response = await fetch('/api/intake/draft', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: snapshot, step: snapshotStep, revision: snapshotRevision, csrfToken: csrfRef.current }),
          });
          const body = await readJson(response);
          if (!response.ok || !body || typeof body !== 'object') throw new Error(readableError(response, body));
          const saved = body as DraftResponse;
          revisionRef.current = saved.revision;
          setRevision(saved.revision);

          if (changeVersionRef.current === snapshotVersion) {
            dirtyRef.current = false;
            stepRef.current = safeDraftStep(dataRef.current, saved.step);
            setStep(stepRef.current);
            setSaveState('saved');
            setSaveMessage('Saved securely');
          } else {
            // A user edit happened while this snapshot was in flight. Save the newer data with the fresh revision.
            dirtyRef.current = true;
            savePendingRef.current = true;
          }
        } catch (error) {
          succeeded = false;
          savePendingRef.current = false;
          dirtyRef.current = true;
          setSaveState('error');
          setSaveMessage(error instanceof Error ? error.message : 'We could not save your information. Please retry.');
          break;
        }
      }
      return succeeded;
    })();

    saveLoopRef.current = loop;
    try {
      return await loop;
    } finally {
      if (saveLoopRef.current === loop) saveLoopRef.current = null;
    }
  }, []);

  const saveNow = useCallback(async () => {
    savePendingRef.current = true;
    return processSave();
  }, [processSave]);

  useEffect(() => {
    if (!ready || !dirtyRef.current) return;
    const timeout = window.setTimeout(() => { void saveNow(); }, 800);
    return () => window.clearTimeout(timeout);
  }, [data, step, ready, saveNow]);

  const update = useCallback((path: string, value: string | boolean) => {
    markDirty();
    const nextData = setPath(dataRef.current, path, value);
    dataRef.current = nextData;
    setData(nextData);
    setSubmissionError('');
    setErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  }, [markDirty]);

  const mutate = useCallback((callback: (draft: Record<string, unknown>) => void) => {
    markDirty();
    const next = structuredClone(dataRef.current) as unknown as Record<string, unknown>;
    callback(next);
    dataRef.current = next as unknown as IntakeData;
    setData(dataRef.current);
    setErrors({});
    setSubmissionError('');
  }, [markDirty]);

  const updateMaritalStatus = useCallback((value: string) => {
    markDirty();
    const next = structuredClone(dataRef.current) as unknown as Record<string, unknown>;
    next.maritalStatus = value;
    const filing = String(next.filingStatus ?? '');
    if (!filing || filing === 'SINGLE' || filing === 'MARRIED_FILING_JOINTLY') {
      next.filingStatus = value === 'MARRIED' ? 'MARRIED_FILING_JOINTLY' : 'SINGLE';
    }
    if (value !== 'MARRIED') next.spouse = structuredClone(emptyIntake.spouse);
    dataRef.current = next as unknown as IntakeData;
    setData(dataRef.current);
    setSubmissionError('');
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([path]) => path !== 'maritalStatus' && !path.startsWith('spouse.'))));
  }, [markDirty]);

  const firstInvalidStep = useCallback((fieldErrors: Record<string, string>) => {
    const errorPaths = Object.keys(fieldErrors);
    for (const configuredStep of steps) {
      if (configuredStep.fields.some((field) => errorPaths.some((path) => path === field.key || path.startsWith(`${field.key}.`) || field.key.startsWith(`${path}.`)))) {
        return configuredStep.number;
      }
    }
    return 8;
  }, []);

  const jumpToFirstInvalidStep = useCallback((fieldErrors: Record<string, string>) => {
    setCurrentStep(firstInvalidStep(fieldErrors));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [firstInvalidStep, setCurrentStep]);

  const navigateToStep = (target: number) => {
    const result = resolveStepNavigation(dataRef.current, stepRef.current, target);
    if (!result.allowed) {
      setErrors(result.errors);
      setSubmissionError(`Complete Step ${result.step} before continuing. Your answers remain saved as a draft.`);
      setCurrentStep(result.step);
      focusQuestion(Object.keys(result.errors)[0]);
      return;
    }
    setErrors({});
    setSubmissionError('');
    setCurrentStep(result.step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nextStep = () => navigateToStep(stepRef.current + 1);

  const previousStep = () => {
    navigateToStep(stepRef.current - 1);
  };

  const sendResume = async () => {
    setResumeMessage('');
    try {
      if (!dataRef.current.email) {
        setErrors((current) => ({ ...current, email: 'Enter the email address you want to use first.' }));
        setResumeMessage('Enter and save your email address first.');
        return;
      }
      const saved = await saveNow();
      if (!saved) {
        setResumeMessage('Your draft has not saved yet. Retry the save before requesting a resume link.');
        return;
      }
      const response = await fetch('/api/intake/resume', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dataRef.current.email, csrfToken: csrfRef.current }),
      });
      const body = await readJson(response);
      if (!response.ok || !body || typeof body !== 'object') {
        setResumeMessage(readableError(response, body));
        return;
      }
      setResumeMessage(String((body as { message?: unknown }).message ?? 'Resume-link delivery is pending.'));
    } catch (error) {
      setResumeMessage(error instanceof Error ? error.message : 'We could not request a resume link. Please try again.');
    }
  };

  const uploadSsa = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setErrors((current) => { const next = { ...current }; delete next.ssaUploadId; return next; });
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('csrfToken', csrfRef.current);
      const response = await fetch('/api/intake/upload', { method: 'POST', credentials: 'same-origin', body: formData });
      const body = await readJson(response);
      if (!response.ok || !body || typeof body !== 'object' || !('id' in body)) {
        setErrors((current) => ({ ...current, ssaUploadId: readableError(response, body) }));
        return;
      }
      const saved = body as { id: string; name: string; size: number };
      setUpload(saved);
      update('ssaUploadId', saved.id);
    } catch (error) {
      setErrors((current) => ({ ...current, ssaUploadId: error instanceof Error ? error.message : 'We could not upload that file. Please retry.' }));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmissionError('');
    if (stepRef.current !== 8) {
      nextStep();
      return;
    }
    if (dataRef.current.consent !== true) {
      setErrors((current) => ({ ...current, consent: 'Consent is required to submit.' }));
      setSubmissionError('Check the consent box if you agree before submitting. Your answers remain saved as a draft.');
      document.getElementById('intake-consent')?.focus();
      return;
    }
    const allErrors: Record<string, string> = {};
    for (let number = 1; number <= 8; number += 1) Object.assign(allErrors, validateStep(dataRef.current, number));
    const finalParsed = intakeSchema.safeParse(dataRef.current);
    if (!finalParsed.success) {
      for (const issue of finalParsed.error.issues) allErrors[issue.path.join('.')] ??= issue.message;
    }
    if (Object.keys(allErrors).length) {
      setErrors(allErrors);
      const message = `Not submitted: ${Object.values(allErrors)[0]} Correct the highlighted fields, then return to Step 8 and submit.`;
      setSubmissionError(message);
      setSaveMessage(message);
      jumpToFirstInvalidStep(allErrors);
      return;
    }

    setSubmitting(true);
    try {
      const saved = await saveNow();
      if (!saved) return;
      const response = await fetch('/api/intake/submit', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataRef.current, revision: revisionRef.current, csrfToken: csrfRef.current }),
      });
      const body = await readJson(response);
      if (!response.ok) {
        if (body && typeof body === 'object' && 'fields' in body && (body as { fields?: unknown }).fields && typeof (body as { fields?: unknown }).fields === 'object') {
          const fieldErrors = (body as { fields: Record<string, string> }).fields;
          setErrors(fieldErrors);
          jumpToFirstInvalidStep(fieldErrors);
        }
        setSaveState('error');
        const message = readableError(response, body);
        setSubmissionError(message);
        setSaveMessage(message);
        return;
      }
      const delivery = body && typeof body === 'object' && 'emailDelivery' in body ? (body as { emailDelivery?: unknown }).emailDelivery : undefined;
      const emailDelivery = delivery === 'queued' || delivery === 'sent' || delivery === 'failed' ? delivery : undefined;
      router.replace(emailDelivery ? `/intake/thank-you?emailDelivery=${emailDelivery}` : '/intake/thank-you');
    } catch (error) {
      setSaveState('error');
      const message = error instanceof Error ? error.message : 'We could not submit your intake. Your saved draft is still available; please retry.';
      setSubmissionError(message);
      setSaveMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const currentStep = useMemo(() => steps[step - 1], [step]);
  const married = data.maritalStatus === 'MARRIED';
  const earliestIncomplete = useMemo(() => firstIncompleteStep(data), [data]);
  const completedStep = earliestIncomplete === null ? 8 : earliestIncomplete - 1;
  const progress = Math.round((completedStep / 8) * 100);
  const currentErrors = useMemo(() => validateStep(data, step), [data, step]);
  const displayErrors = { ...errors, ...currentErrors };
  const continueLocked = earliestIncomplete !== null && earliestIncomplete <= step;
  const goToStep = navigateToStep;

  useEffect(() => {
    if (!ready) return;
    const allowed = safeDraftStep(dataRef.current, stepRef.current);
    if (allowed < stepRef.current) {
      setErrors(validateStep(dataRef.current, allowed));
      setSubmissionError(`Complete Step ${allowed} before continuing.`);
      setCurrentStep(allowed);
    }
  }, [data, ready, setCurrentStep]);

  if (!ready) {
    return <main className="page-shell intake-shell"><section className="card intake-card"><p className="eyebrow">LSRT Insurance</p><h1>Retirement planning intake</h1><p className="notice"><strong>Development preview — fictional information only.</strong> Do not enter or upload real personal, financial, or account information until this intake is released.</p><p className={saveState === 'error' ? 'error' : 'muted'} role="status">{saveMessage}</p>{saveState === 'error' ? <button className="button button-primary" type="button" onClick={() => void loadDraft()}>Retry opening draft</button> : null}</section></main>;
  }

  return <main className="page-shell intake-shell">
    <section className="card intake-card">
      <div className="intake-top">
        <div><p className="eyebrow">LSRT Insurance</p><h1>Build your retirement planning profile</h1><p className="muted">Eight short steps. Your information is saved on the server as you go.</p></div>
        <div className={saveState === 'error' ? 'error save-status' : 'save-status'} role="status" aria-live="polite">
          {saveState === 'saving' ? 'Saving… ' : null}{saveMessage}
          {saveState === 'error' ? <><button type="button" className="button button-small" onClick={() => void saveNow()}>Retry save</button><button type="button" className="button button-small" onClick={() => void loadDraft()}>Reload draft</button></> : null}
        </div>
      </div>
      <p className="notice"><strong>Development preview — fictional information only.</strong> Do not enter or upload real personal, financial, or account information until this intake is released.</p>
      <div aria-label={`Step ${step} of 8`}>
        <div><strong>Step {step} of 8</strong><span className="muted"> — {currentStep.title}</span><span className="pill">{progress}% complete</span></div>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`Step ${step} of 8, ${progress}% complete`}><div style={{ width: `${progress}%` }} /></div>
        <nav className="step-nav" aria-label="Intake steps">{steps.map((item) => <button key={item.number} type="button" className={item.number === step ? 'active' : ''} aria-current={item.number === step ? 'step' : undefined} disabled={item.number > completedStep + 1} onClick={() => goToStep(item.number)}>Step {item.number}: {item.title}</button>)}</nav>
      </div>
    </section>

    <form onSubmit={submit} noValidate>
      {annualUpdate && <p className="notice">Annual information update: review your previous answers before submitting. Consent is required again. Your existing SSA document and prior reports are retained.</p>}
      <section className="card intake-card">
        <p className="eyebrow">Step {step}</p>
        <h2 className="section-title">{currentStep.title}</h2>
        <p className="muted">{currentStep.description}</p>
        <StepValidationSummary step={step} errors={currentErrors} onFocusField={focusQuestion} />

        {step === 1 ? <AboutStep data={data} errors={displayErrors} married={married} onChange={update} onMaritalChange={updateMaritalStatus} /> : null}
        {step === 2 ? <IncomeStep data={data} errors={displayErrors} married={married} onChange={update} /> : null}
        {step === 3 ? <SavingsStep data={data} errors={displayErrors} married={married} onChange={update} /> : null}
        {step === 4 ? <ExpensesStep data={data} errors={displayErrors} onChange={update} mutate={mutate} /> : null}
        {step === 5 ? <SocialSecurityStep data={data} errors={displayErrors} married={married} onChange={update} upload={upload} uploading={uploading} onUpload={uploadSsa} annualUpdate={annualUpdate} /> : null}
        {step === 6 ? <GoalsStep data={data} errors={displayErrors} married={married} onChange={update} mutate={mutate} /> : null}
        {step === 7 ? <HealthStep data={data} errors={displayErrors} married={married} onChange={update} mutate={mutate} /> : null}
        {step === 8 ? <EstateReviewStep data={data} errors={displayErrors} onChange={update} onEdit={goToStep} /> : null}
      </section>

      <section className="card intake-card">
        {submissionError && step !== 8 ? <p className="error" role="alert">{submissionError}</p> : null}
        <div className="form-grid">
          <div>{step > 1 ? <button type="button" className="button" onClick={previousStep}>Back</button> : null}</div>
          <div>{step < 8 ? <><button type="button" className="button button-primary" disabled={continueLocked} aria-describedby={continueLocked ? 'intake-step-errors' : undefined} onClick={nextStep}>Continue</button>{continueLocked ? <p className="error">Answer the highlighted questions to unlock Continue.</p> : null}</> : <IntakeSubmitControls consent={Boolean(data.consent)} submitting={submitting} blocked={continueLocked} error={displayErrors.consent} submissionError={submissionError} onConsentChange={(checked) => update('consent', checked)} />}</div>
        </div>
        <div className="notice">
          <strong>Development-preview resume links</strong>
          <p className="muted">Email delivery may be configured differently before release. Do not use a real email address in this fictional-data preview.</p>
          <button type="button" className="button" onClick={() => void sendResume()}>Request a test resume link</button>
          {resumeMessage ? <p className="muted" role="status">{resumeMessage}</p> : null}
        </div>
      </section>
    </form>
  </main>;
}

function AboutStep({ data, errors, married, onChange, onMaritalChange }: { data: IntakeData; errors: Record<string, string>; married: boolean; onChange: (path: string, value: string | boolean) => void; onMaritalChange: (value: string) => void }) {
  return <div className="form-grid">
    <TextControl data={data} errors={errors} path="firstName" label="First name" required onChange={onChange} />
    <TextControl data={data} errors={errors} path="lastName" label="Last name" required onChange={onChange} />
    <TextControl data={data} errors={errors} path="email" label="Email" type="email" required onChange={onChange} inputMode="email" />
    <TextControl data={data} errors={errors} path="phone" label="Phone" type="tel" required onChange={onChange} inputMode="tel" />
    <TextControl data={data} errors={errors} path="dob" label="Date of birth" type="date" required onChange={onChange} />
    <SelectControl data={data} errors={errors} path="state" label="State of residence" required options={stateOptions} onChange={onChange} />
    <SelectControl data={data} errors={errors} path="maritalStatus" label="Marital status" required options={[{ value: 'SINGLE', label: 'Single' }, { value: 'MARRIED', label: 'Married' }, { value: 'DIVORCED', label: 'Divorced' }, { value: 'WIDOWED', label: 'Widowed' }]} onChange={(_, value) => onMaritalChange(value)} />
    <SelectControl data={data} errors={errors} path="filingStatus" label="Tax filing status" required options={[{ value: 'SINGLE', label: 'Single' }, { value: 'MARRIED_FILING_JOINTLY', label: 'Married Filing Jointly' }, { value: 'MARRIED_FILING_SEPARATELY', label: 'Married Filing Separately' }, { value: 'HEAD_OF_HOUSEHOLD', label: 'Head of Household' }]} onChange={onChange} />
    <TextControl data={data} errors={errors} path="dependents" label="Number of dependents" type="number" onChange={onChange} inputMode="numeric" />
    <SelectControl data={data} errors={errors} path="dependentsSpecialNeeds" label="Any dependents with special needs?" options={yesNoOptions} onChange={onChange} />
    <SelectControl data={data} errors={errors} path="primary.employmentStatus" label="Your employment status" options={employmentOptions} onChange={onChange} />
    {married ? <>
      <TextControl data={data} errors={errors} path="spouse.firstName" label="Spouse first name" required onChange={onChange} />
      <TextControl data={data} errors={errors} path="spouse.lastName" label="Spouse last name" required onChange={onChange} />
      <TextControl data={data} errors={errors} path="spouse.dob" label="Spouse date of birth" type="date" required onChange={onChange} />
      <SelectControl data={data} errors={errors} path="spouse.employmentStatus" label="Spouse employment status" options={employmentOptions} onChange={onChange} />
    </> : null}
  </div>;
}

function IncomePerson({ data, errors, owner, onChange }: { data: IntakeData; errors: Record<string, string>; owner: 'primary' | 'spouse'; onChange: (path: string, value: string | boolean) => void }) {
  const prefix = owner;
  return <PersonHeading owner={owner}><h3>{owner === 'primary' ? 'Your income' : 'Spouse income'}</h3><div className="form-grid">
    <MoneyControl data={data} errors={errors} path={`${prefix}.earnedIncome`} label="Annual gross earned income" required onChange={onChange} help="Use annual income before taxes and deductions. Enter 0 if there is no earned income." />
    <MoneyControl data={data} errors={errors} path={`${prefix}.pensionMonthly`} label="Expected pension at retirement (monthly)" onChange={onChange} />
    <TextControl data={data} errors={errors} path={`${prefix}.pensionStartAge`} label="Pension start age" type="number" inputMode="numeric" onChange={onChange} />
    <SelectControl data={data} errors={errors} path={`${prefix}.pensionSurvivorPercent`} label="Pension survivor percentage" options={[{ value: '0', label: '0%' }, { value: '50', label: '50%' }, { value: '75', label: '75%' }, { value: '100', label: '100%' }]} onChange={onChange} />
    <SelectControl data={data} errors={errors} path={`${prefix}.pensionCola`} label="Pension cost-of-living adjustment?" options={yesNoOptions} onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${prefix}.annuityMonthly`} label="Existing annuity income (monthly)" onChange={onChange} />
    <TextControl data={data} errors={errors} path={`${prefix}.annuityStartAge`} label="Annuity income start age" type="number" inputMode="numeric" onChange={onChange} />
    <SelectControl data={data} errors={errors} path={`${prefix}.annuityTaxQualification`} label="Annuity tax qualification" options={[{ value: 'QUALIFIED', label: 'Qualified (retirement account)' }, { value: 'NONQUALIFIED', label: 'Nonqualified' }]} help="Qualified and nonqualified annuities may receive different tax treatment." onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${prefix}.rentalOtherMonthly`} label="Rental / other retirement income (monthly)" onChange={onChange} />
    <TextControl data={data} errors={errors} path={`${prefix}.rentalEndAge`} label="Rental / other income end age" type="number" inputMode="numeric" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${prefix}.partTimeIncome`} label="Planned part-time income (annual)" onChange={onChange} help="This helps flag Social Security earnings-test considerations." />
    <TextControl data={data} errors={errors} path={`${prefix}.partTimeEndAge`} label="Part-time work end age" type="number" inputMode="numeric" onChange={onChange} />
  </div></PersonHeading>;
}

function IncomeStep({ data, errors, married, onChange }: { data: IntakeData; errors: Record<string, string>; married: boolean; onChange: (path: string, value: string | boolean) => void }) {
  return <><IncomePerson data={data} errors={errors} owner="primary" onChange={onChange} />{married ? <IncomePerson data={data} errors={errors} owner="spouse" onChange={onChange} /> : null}</>;
}

function SavingsPerson({ data, errors, owner, onChange }: { data: IntakeData; errors: Record<string, string>; owner: 'primary' | 'spouse'; onChange: (path: string, value: string | boolean) => void }) {
  const p = owner;
  return <PersonHeading owner={owner}><h3>{owner === 'primary' ? 'Your accounts' : 'Spouse accounts'}</h3><div className="form-grid">
    <MoneyControl data={data} errors={errors} path={`${p}.preTax401k`} label="401(k) / 403(b) / 457 / TSP pre-tax balance" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.roth401k`} label="Roth 401(k) balance" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.traditionalIra`} label="Traditional / SEP / SIMPLE IRA balance" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.rothIra`} label="Roth IRA balance" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.hsaBalance`} label="HSA balance" onChange={onChange} help="HSA money is tax-free only for qualified medical expenses." />
    <SelectControl data={data} errors={errors} path={`${p}.hsaEligibleForQualifiedExpenses`} label="HSA funds available for qualified medical expenses" options={yesNoUnsureOptions} onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.brokerage`} label="Brokerage / taxable investments" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.brokerageCostBasis`} label="Estimated taxable brokerage cost basis" onChange={onChange} help="Cost basis is different from market value; use your statement or tax records if available." />
    <MoneyControl data={data} errors={errors} path={`${p}.cashSavingsCds`} label="Cash / savings / CDs" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.annuityCashValue`} label="Fixed or indexed annuity cash value" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.lifeInsuranceCashValue`} label="Cash value life insurance" onChange={onChange} help="Cash value life insurance is tracked separately from investable assets." />
    <PercentControl data={data} errors={errors} path={`${p}.employeeContributionPercent`} label="Employee contribution rate" onChange={onChange} />
    <PercentControl data={data} errors={errors} path={`${p}.employerMatchPercent`} label="Employer match rate" onChange={onChange} />
    <MoneyControl data={data} errors={errors} path={`${p}.iraRothContribution`} label="Current yearly IRA / Roth contribution" onChange={onChange} />
  </div></PersonHeading>;
}

function SavingsStep({ data, errors, married, onChange }: { data: IntakeData; errors: Record<string, string>; married: boolean; onChange: (path: string, value: string | boolean) => void }) {
  const known = data.allocation.status === 'KNOWN';
  return <><SavingsPerson data={data} errors={errors} owner="primary" onChange={onChange} />{married ? <SavingsPerson data={data} errors={errors} owner="spouse" onChange={onChange} /> : null}<section className="card"><h3>Approximate household mix</h3><RadioControl data={data} errors={errors} path="allocation.status" label="Do you know your stock, bond and cash mix?" options={[{ value: 'KNOWN', label: 'Yes, I know the mix' }, { value: 'NOT_SURE', label: 'Not sure' }]} onChange={onChange} />{known ? <div className="form-grid"><PercentControl data={data} errors={errors} path="allocation.stocksPercent" label="Stocks" required onChange={onChange} /><PercentControl data={data} errors={errors} path="allocation.bondsPercent" label="Bonds" required onChange={onChange} /><PercentControl data={data} errors={errors} path="allocation.cashPercent" label="Cash" required onChange={onChange} /></div> : null}</section></>;
}

function ExpensesStep({ data, errors, onChange, mutate }: { data: IntakeData; errors: Record<string, string>; onChange: (path: string, value: string | boolean) => void; mutate: (callback: (draft: Record<string, unknown>) => void) => void }) {
  const goals = data.oneTimeGoals;
  const debts = data.debts;
  const current = String(data.expenses.currentMonthly ?? '').replace(/[$,\s]/g, '');
  const suggestRetirementSpending = () => {
    if (/^\d+$/.test(current)) onChange('expenses.retirementMonthly', String(Math.round(Number(current) * 0.8)));
  };
  return <>
    <div className="form-grid">
      <MoneyControl data={data} errors={errors} path="expenses.currentMonthly" label="Current monthly spending" required onChange={onChange} />
      <MoneyControl data={data} errors={errors} path="expenses.retirementMonthly" label="Expected monthly spending in retirement" required onChange={onChange} help="Use today’s dollars; you can update this with your advisor." />
      <MoneyControl data={data} errors={errors} path="expenses.essentialMonthly" label="Essential monthly retirement spending (optional)" onChange={onChange} help="Include needs such as housing, food, utilities, taxes and insurance. Leave blank if unknown; do not assume all spending is essential." />
      <MoneyControl data={data} errors={errors} path="expenses.discretionaryMonthly" label="Discretionary monthly retirement spending" onChange={onChange} help="Include flexible spending such as travel and hobbies." />
    </div>
    <button type="button" className="button" onClick={suggestRetirementSpending}>Use 80% of current spending</button>
    <section className="card"><h3>Big one-time goals</h3><p className="muted">Examples: travel, home repair, car or wedding.</p>{goals.map((goal, index) => <div className="form-grid" key={index}>
      <TextControl data={data} errors={errors} path={`oneTimeGoals.${index}.item`} label="Goal item" required onChange={onChange} />
      <MoneyControl data={data} errors={errors} path={`oneTimeGoals.${index}.amount`} label="Amount" required onChange={onChange} />
      <TextControl data={data} errors={errors} path={`oneTimeGoals.${index}.year`} label="Year" type="number" required inputMode="numeric" onChange={onChange} />
      <button type="button" className="button" onClick={() => mutate((draft) => { (draft.oneTimeGoals as unknown[]).splice(index, 1); })}>Remove</button>
    </div>)}<button type="button" className="button" onClick={() => mutate((draft) => { (draft.oneTimeGoals as unknown[]).push({ item: '', amount: '', year: '' }); })}>Add one-time goal</button></section>
    <section className="card"><h3>Home</h3><div className="form-grid"><MoneyControl data={data} errors={errors} path="home.value" label="Home value" onChange={onChange} /><MoneyControl data={data} errors={errors} path="home.mortgageBalance" label="Mortgage balance" onChange={onChange} /><MoneyControl data={data} errors={errors} path="home.monthlyPayment" label="Mortgage monthly payment" onChange={onChange} /><TextControl data={data} errors={errors} path="home.payoffYear" label="Mortgage payoff year" type="number" inputMode="numeric" onChange={onChange} /></div></section>
    <section className="card"><h3>Other debts</h3>{debts.map((debt, index) => <div className="form-grid" key={index}>
      <TextControl data={data} errors={errors} path={`debts.${index}.name`} label="Debt" required onChange={onChange} />
      <MoneyControl data={data} errors={errors} path={`debts.${index}.balance`} label="Balance" required onChange={onChange} />
      <PercentControl data={data} errors={errors} path={`debts.${index}.rate`} label="Interest rate" help="Enter annual interest rate. Debts over 8% may need extra attention." onChange={onChange} />
      <MoneyControl data={data} errors={errors} path={`debts.${index}.monthlyPayment`} label="Monthly payment" required onChange={onChange} />
      <button type="button" className="button" onClick={() => mutate((draft) => { (draft.debts as unknown[]).splice(index, 1); })}>Remove</button>
    </div>)}<button type="button" className="button" onClick={() => mutate((draft) => { (draft.debts as unknown[]).push({ name: '', balance: '', rate: '', monthlyPayment: '' }); })}>Add debt</button></section>
  </>;
}

function SocialSecurityPerson({ data, errors, owner, onChange }: { data: IntakeData; errors: Record<string, string>; owner: 'primary' | 'spouse'; onChange: (path: string, value: string | boolean) => void }) {
  const p = owner;
  const receiving = pathValue(data, `${p}.receivingSocialSecurity`) === 'YES';
  return <PersonHeading owner={owner}><h3>{owner === 'primary' ? 'Your Social Security' : 'Spouse Social Security'}</h3><div className="form-grid">
    <MoneyControl data={data} errors={errors} path={`${p}.pia`} label="Estimated monthly benefit at Full Retirement Age (PIA)" required onChange={onChange} help="Log in at ssa.gov/myaccount and use the amount shown at your full retirement age." />
    <SelectControl data={data} errors={errors} path={`${p}.receivingSocialSecurity`} label="Already receiving benefits?" options={yesNoOptions} onChange={onChange} />
    {receiving ? <><MoneyControl data={data} errors={errors} path={`${p}.socialSecurityMonthly`} label="Current benefit amount (monthly)" required onChange={onChange} /><TextControl data={data} errors={errors} path={`${p}.socialSecurityStartAge`} label="Benefit start age" required type="number" inputMode="numeric" onChange={onChange} /></> : null}
    <SelectControl data={data} errors={errors} path={`${p}.claimAge`} label="Planned claiming age" options={[...Array.from({ length: 9 }, (_, index) => ({ value: String(index + 62), label: `Age ${index + 62}` })), { value: 'ADVISE_ME', label: 'Advise me' }]} onChange={onChange} />
    <SelectControl data={data} errors={errors} path={`${p}.governmentPensionNonCovered`} label="Government pension from non-covered work?" options={yesNoOptions} help="Informational only; it helps your advisor ask the right questions." onChange={onChange} />
  </div></PersonHeading>;
}

function SocialSecurityStep({ data, errors, married, onChange, upload, uploading, onUpload, annualUpdate }: { data: IntakeData; errors: Record<string, string>; married: boolean; onChange: (path: string, value: string | boolean) => void; upload: UploadMeta; uploading: boolean; onUpload: (file: File | undefined) => Promise<void>; annualUpdate?: boolean }) {
  return <><SocialSecurityPerson data={data} errors={errors} owner="primary" onChange={onChange} />{married ? <SocialSecurityPerson data={data} errors={errors} owner="spouse" onChange={onChange} /> : null}{annualUpdate ? <section className="card"><h3>SSA statement</h3><p className="muted">Your existing statement is retained privately. Contact your advisor if the document needs updating.</p></section> : <section className="card"><h3>SSA statement (optional)</h3><p id="ssa-upload-help" className="notice"><strong>Development preview — fictional PDF only.</strong> Do not upload a real Social Security statement, account number, or other personal information until release.</p><label className="field-label" htmlFor="ssa-upload">Choose a fictional PDF statement</label><input id="ssa-upload" className="input" type="file" accept="application/pdf,.pdf" aria-describedby="ssa-upload-help ssa-upload-error" onChange={(event) => void onUpload(event.target.files?.[0])} disabled={uploading} />{uploading ? <p className="muted">Uploading securely…</p> : null}{upload ? <p className="pill">Attached: {upload.name} ({Math.ceil(upload.size / 1024)} KB)</p> : null}{errors.ssaUploadId ? <p id="ssa-upload-error" className="error">{errors.ssaUploadId}</p> : null}</section>}</>;
}

function GoalsStep({ data, errors, married, onChange, mutate }: { data: IntakeData; errors: Record<string, string>; married: boolean; onChange: (path: string, value: string | boolean) => void; mutate: (callback: (draft: Record<string, unknown>) => void) => void }) {
  const ranked = Array.from({ length: 3 }, (_, index) => data.rankedConcerns[index] ?? '');
  const setConcern = (index: number, value: string) => mutate((draft) => { const list = Array.from({ length: 3 }, (_, current) => (draft.rankedConcerns as string[])[current] ?? ''); list[index] = value; draft.rankedConcerns = list; });
  return <><div className="form-grid"><TextControl data={data} errors={errors} path="primary.retirementAge" label="Your desired retirement age" type="number" required inputMode="numeric" onChange={onChange} />{married ? <TextControl data={data} errors={errors} path="spouse.retirementAge" label="Spouse desired retirement age" type="number" required inputMode="numeric" onChange={onChange} /> : null}<SelectControl data={data} errors={errors} path="lifestyle" label="Retirement lifestyle" options={[{ value: 'SIMPLE', label: 'Simple' }, { value: 'COMFORTABLE', label: 'Comfortable' }, { value: 'ACTIVE_TRAVEL', label: 'Active-travel' }, { value: 'LUXURY', label: 'Luxury' }]} onChange={onChange} /></div><section className="card"><h3>Rank your top three concerns</h3><p className="muted">Choose three different concerns, in order of importance.</p><div className="form-grid">{ranked.map((value, index) => { const id = `intake-ranked-concern-${index}`; return <Field key={index} label={`Priority ${index + 1}`} controlId={id} required error={errors[`rankedConcerns.${index}`] ?? errors.rankedConcerns}><select id={id} className="input" required aria-invalid={Boolean(errors[`rankedConcerns.${index}`] ?? errors.rankedConcerns)} value={value} onChange={(event) => setConcern(index, event.target.value)}><option value="">Select a concern</option>{concernOptions.map((option) => <option key={option.value} value={option.value} disabled={ranked.some((item, other) => other !== index && item === option.value)}>{option.label}</option>)}</select></Field>; })}</div></section><div className="form-grid"><MoneyControl data={data} errors={errors} path="legacyAmount" label="Desired amount to leave heirs or charity" onChange={onChange} /><MoneyControl data={data} errors={errors} path="annualCharity" label="Charitable giving each year" onChange={onChange} /></div></>;
}

function HealthStep({ data, errors, married, onChange, mutate }: { data: IntakeData; errors: Record<string, string>; married: boolean; onChange: (path: string, value: string | boolean) => void; mutate: (callback: (draft: Record<string, unknown>) => void) => void }) {
  const hasLtc = data.health.longTermCareInsurance === 'YES';
  const updateRisk = (question: number, answer: number) => mutate((draft) => { const answers = Array.from({ length: 5 }, (_, index) => Number((draft.riskAnswers as number[])[index] ?? 0)); answers[question] = answer; draft.riskAnswers = answers; });
  const score = data.riskAnswers.reduce((total, answer) => total + answer, 0);
  const riskLabel = data.riskAnswers.length === 5 && data.riskAnswers.every((answer) => answer >= 1 && answer <= 5) ? score <= 11 ? 'Conservative' : score <= 18 ? 'Moderate' : 'Aggressive' : '';
  return <><div className="form-grid"><SelectControl data={data} errors={errors} path="primary.healthStatus" label="Your health status" options={healthOptions} onChange={onChange} />{married ? <SelectControl data={data} errors={errors} path="spouse.healthStatus" label="Spouse health status" options={healthOptions} onChange={onChange} /> : null}<SelectControl data={data} errors={errors} path="health.familyLongevity" label="Did either parent live past age 85?" options={yesNoOptions} onChange={onChange} /><SelectControl data={data} errors={errors} path="health.currentCoverage" label="Current health coverage" options={coverageOptions} onChange={onChange} /><SelectControl data={data} errors={errors} path="health.preMedicarePlan" label="Plan before Medicare" options={coverageOptions} onChange={onChange} /></div><section className="card"><h3>Insurance protection</h3><div className="form-grid"><SelectControl data={data} errors={errors} path="primary.lifeInsuranceType" label="Your life insurance type" options={lifeInsuranceOptions} onChange={onChange} /><MoneyControl data={data} errors={errors} path="primary.lifeInsuranceDeathBenefit" label="Your life insurance death benefit" onChange={onChange} />{married ? <><SelectControl data={data} errors={errors} path="spouse.lifeInsuranceType" label="Spouse life insurance type" options={lifeInsuranceOptions} onChange={onChange} /><MoneyControl data={data} errors={errors} path="spouse.lifeInsuranceDeathBenefit" label="Spouse life insurance death benefit" onChange={onChange} /></> : null}<SelectControl data={data} errors={errors} path="health.longTermCareInsurance" label="Long-term care insurance?" options={yesNoOptions} onChange={onChange} />{hasLtc ? <MoneyControl data={data} errors={errors} path="health.longTermCareDailyBenefit" label="Long-term care daily benefit" required onChange={onChange} /> : null}<SelectControl data={data} errors={errors} path="health.disabilityInsurance" label="Disability insurance (if still working)?" options={yesNoOptions} onChange={onChange} /></div></section><section className="card"><h3>Risk questionnaire</h3><p className="muted">This is a planning preference discussion, not a recommendation or a health underwriting assessment.</p>{riskQuestions.map((question, index) => { const labelId = `intake-risk-${index}-label`; return <Field key={question} label={`${index + 1}. ${question}`} labelId={labelId} required error={errors[`riskAnswers.${index}`] ?? errors.riskAnswers}><div className="form-grid" role="radiogroup" aria-labelledby={labelId} aria-invalid={Boolean(errors[`riskAnswers.${index}`] ?? errors.riskAnswers)} aria-describedby={errors[`riskAnswers.${index}`] ?? errors.riskAnswers ? `${labelId}-error` : undefined}>{riskChoices.map((choice, choiceIndex) => <label className="notice" key={choice}><input type="radio" name={`risk-${index}`} checked={data.riskAnswers[index] === choiceIndex + 1} onChange={() => updateRisk(index, choiceIndex + 1)} /> {choice}</label>)}</div></Field>; })}{riskLabel ? <p className="pill">Current profile: {riskLabel} ({score}/25)</p> : null}</section></>;
}

function EstateReviewStep({ data, errors, onChange, onEdit }: { data: IntakeData; errors: Record<string, string>; onChange: (path: string, value: string | boolean) => void; onEdit: (step: number) => void }) {
  const documents: Array<[keyof IntakeData['estate'], string]> = [['will', 'Will'], ['livingTrust', 'Living trust'], ['financialPoa', 'Financial power of attorney'], ['healthcareDirective', 'Healthcare directive'], ['updatedBeneficiaries', 'Updated beneficiaries']];
  return <><section className="card"><h3>Estate documents</h3><div className="form-grid">{documents.map(([key, label]) => <div className="notice" key={key}><SelectControl data={data} errors={errors} path={`estate.${key}.status`} label={label} options={yesNoUnsureOptions} onChange={onChange} /><TextControl data={data} errors={errors} path={`estate.${key}.updatedYear`} label="Year last updated" type="number" inputMode="numeric" onChange={onChange} /></div>)}</div></section><section aria-labelledby="
review-heading" className="card"><p className="eyebrow">Final review</p><h3 id="review-heading">Check every answer before you submit</h3><p className="muted">Use an Edit link to return to any step. Nothing is submitted until you select consent and choose Submit.</p><div className="form-grid"><ReviewSection step={1} title="About you" detail="Identity, household and employment" value={{ firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone, dob: data.dob, state: data.state, maritalStatus: data.maritalStatus, filingStatus: data.filingStatus, dependents: data.dependents, dependentsSpecialNeeds: data.dependentsSpecialNeeds, primaryEmployment: data.primary.employmentStatus, spouse: data.maritalStatus === 'MARRIED' ? { firstName: data.spouse.firstName, lastName: data.spouse.lastName, dob: data.spouse.dob, employmentStatus: data.spouse.employmentStatus } : 'Not applicable' }} onEdit={() => onEdit(1)} /><ReviewSection step={2} title="Income" detail="Income today and income expected in retirement" value={{ primary: pick(data.primary, ['earnedIncome', 'pensionMonthly', 'pensionStartAge', 'pensionSurvivorPercent', 'pensionCola', 'annuityMonthly', 'annuityStartAge', 'annuityTaxQualification', 'rentalOtherMonthly', 'rentalEndAge', 'partTimeIncome', 'partTimeEndAge']), spouse: data.maritalStatus === 'MARRIED' ? pick(data.spouse, ['earnedIncome', 'pensionMonthly', 'pensionStartAge', 'pensionSurvivorPercent', 'pensionCola', 'annuityMonthly', 'annuityStartAge', 'annuityTaxQualification', 'rentalOtherMonthly', 'rentalEndAge', 'partTimeIncome', 'partTimeEndAge']) : 'Not applicable' }} onEdit={() => onEdit(2)} /><ReviewSection step={3} title="Savings & investments" detail="Tax-type balances and household mix" value={{ primary: pick(data.primary, ['preTax401k', 'roth401k', 'traditionalIra', 'rothIra', 'hsaBalance', 'hsaEligibleForQualifiedExpenses', 'brokerage', 'brokerageCostBasis', 'cashSavingsCds', 'annuityCashValue', 'lifeInsuranceCashValue', 'employeeContributionPercent', 'employerMatchPercent', 'iraRothContribution']), spouse: data.maritalStatus === 'MARRIED' ? pick(data.spouse, ['preTax401k', 'roth401k', 'traditionalIra', 'rothIra', 'hsaBalance', 'hsaEligibleForQualifiedExpenses', 'brokerage', 'brokerageCostBasis', 'cashSavingsCds', 'annuityCashValue', 'lifeInsuranceCashValue', 'employeeContributionPercent', 'employerMatchPercent', 'iraRothContribution']) : 'Not applicable', allocation: data.allocation }} onEdit={() => onEdit(3)} /><ReviewSection step={4} title="Expenses, home & debts" detail="Spending, one-time goals, home and debt details" value={{ expenses: data.expenses, oneTimeGoals: data.oneTimeGoals, home: data.home, debts: data.debts }} onEdit={() => onEdit(4)} /><ReviewSection step={5} title="Social Security" detail="Benefit estimates, claims and optional statement" value={{ primary: pick(data.primary, ['pia', 'receivingSocialSecurity', 'socialSecurityMonthly', 'socialSecurityStartAge', 'claimAge', 'governmentPensionNonCovered']), spouse: data.maritalStatus === 'MARRIED' ? pick(data.spouse, ['pia', 'receivingSocialSecurity', 'socialSecurityMonthly', 'socialSecurityStartAge', 'claimAge', 'governmentPensionNonCovered']) : 'Not applicable', ssaStatement: data.ssaUploadId ? 'Private PDF attached' : 'No statement attached' }} onEdit={() => onEdit(5)} /><ReviewSection step={6} title="Retirement goals" detail="Retirement timing, lifestyle and priorities" value={{ primaryRetirementAge: data.primary.retirementAge, spouseRetirementAge: data.maritalStatus === 'MARRIED' ? data.spouse.retirementAge : 'Not applicable', lifestyle: data.lifestyle, rankedConcerns: data.rankedConcerns, legacyAmount: data.legacyAmount, annualCharity: data.annualCharity }} onEdit={() => onEdit(6)} /><ReviewSection step={7} title="Health, insurance & risk" detail="Planning inputs and risk responses" value={{ primary: pick(data.primary, ['healthStatus', 'lifeInsuranceType', 'lifeInsuranceDeathBenefit']), spouse: data.maritalStatus === 'MARRIED' ? pick(data.spouse, ['healthStatus', 'lifeInsuranceType', 'lifeInsuranceDeathBenefit']) : 'Not applicable', health: data.health, riskAnswers: data.riskAnswers }} onEdit={() => onEdit(7)} /><ReviewSection step={8} title="Estate documents" detail="Estate-document status and update years" value={data.estate} onEdit={() => onEdit(8)} /></div></section><div className="field" aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}><label htmlFor="intake-website">Website</label><input id="intake-website" tabIndex={-1} autoComplete="off" value={data.website} onChange={(event) => onChange('website', event.target.value)} /></div></>;
}

function pick(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}
