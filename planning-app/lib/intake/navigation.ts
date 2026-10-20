import { type IntakeData, validateStep } from './schema';

export type StepNavigation = { allowed: boolean; step: number; errors: Record<string, string> };

function normalizeStep(step: number) {
  return Number.isFinite(step) ? Math.max(1, Math.min(8, Math.trunc(step))) : 1;
}

export function firstIncompleteStep(data: IntakeData): number | null {
  for (let step = 1; step <= 8; step += 1) {
    if (Object.keys(validateStep(data, step)).length) return step;
  }
  return null;
}

/** Incomplete answers are allowed to save, but never unlock later pages. */
export function safeDraftStep(data: IntakeData, requested: number): number {
  const earliest = firstIncompleteStep(data);
  return Math.min(normalizeStep(requested), earliest ?? 8);
}

/** Backward edits stay available. Every forward path must validate all pages
 * before its target using current answers, not previously-completed flags. */
export function resolveStepNavigation(data: IntakeData, current: number, target: number): StepNavigation {
  const destination = normalizeStep(target);
  if (destination <= normalizeStep(current)) return { allowed: true, step: destination, errors: {} };
  for (let step = 1; step < destination; step += 1) {
    const errors = validateStep(data, step);
    if (Object.keys(errors).length) return { allowed: false, step, errors };
  }
  return { allowed: true, step: destination, errors: {} };
}
