import { fieldsByKey } from '@/lib/intake/fields';

type Props = { step: number; errors: Record<string, string>; onFocusField: (path: string) => void };

function questionLabel(path: string) {
  const descriptor = fieldsByKey[path] ?? fieldsByKey[path.split('.').slice(0, -1).join('.')];
  const label = descriptor?.label ?? path.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('.', ' ');
  return path.startsWith('spouse.') && !/^spouse/i.test(label) ? `Spouse: ${label}` : label;
}

export function StepValidationSummary({ step, errors, onFocusField }: Props) {
  const entries = Object.entries(errors);
  if (!entries.length) return null;
  return <section className="notice step-validation-summary" id="intake-step-errors" role="alert" aria-labelledby="intake-step-errors-heading">
    <h3 id="intake-step-errors-heading">Complete Step {step} before continuing</h3>
    <p>Answer or correct the highlighted questions below. Your answers are still saved as a draft.</p>
    <ul>{entries.map(([path, message]) => <li key={path}><button type="button" className="validation-question-link" onClick={() => onFocusField(path)}>{questionLabel(path)}</button>{' — '}{message.startsWith('Invalid enum') ? 'Choose an answer.' : message}</li>)}</ul>
  </section>;
}
