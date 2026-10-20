"use client";

import { useId } from "react";
import { steps, type FieldDescriptor } from "@/lib/intake/fields";
import type { JsonRecord, JsonValue } from "./types";

type Path = string[];

function deepCopy<T extends JsonValue>(value: T): T { return structuredClone(value); }
function getAtPath(data: JsonRecord, path: Path): JsonValue | undefined {
  return path.reduce<JsonValue | undefined>((current, segment) => current && typeof current === "object" && !Array.isArray(current) ? (current as JsonRecord)[segment] : undefined, data);
}
function setAtPath(data: JsonRecord, path: Path, value: JsonValue): JsonRecord {
  const root = deepCopy(data);
  let current: JsonRecord = root;
  path.forEach((segment, index) => {
    if (index === path.length - 1) current[segment] = value;
    else {
      const existing = current[segment];
      if (!existing || typeof existing !== "object" || Array.isArray(existing)) current[segment] = {};
      current = current[segment] as JsonRecord;
    }
  });
  return root;
}
function shown(field: FieldDescriptor, data: JsonRecord) {
  if (!field.showWhen) return true;
  const actual = getAtPath(data, field.showWhen.key.split("."));
  const expected = field.showWhen.equals;
  return Array.isArray(expected) ? expected.includes(String(actual)) : String(actual) === expected;
}
function valueString(value: JsonValue | undefined) {
  return value === undefined || value === null || Array.isArray(value) || typeof value === "object" ? "" : String(value);
}
function inputMode(descriptor: FieldDescriptor) {
  return descriptor.type === "money" || descriptor.type === "number" || descriptor.type === "percentage" ? "decimal" : undefined;
}
function inputType(descriptor: FieldDescriptor) {
  return descriptor.type === "email" ? "email" : descriptor.type === "tel" ? "tel" : descriptor.type === "date" ? "date" : "text";
}
function emptyValue(descriptor: FieldDescriptor): JsonValue {
  if (descriptor.type === "checkbox") return false;
  if (descriptor.type === "repeatable" || descriptor.type === "rank" || (descriptor.type === "radio" && !descriptor.options)) return [];
  return "";
}

function BasicDescriptorInput({ descriptor, value, onChange, idPrefix }: { descriptor: FieldDescriptor; value: JsonValue | undefined; onChange: (next: JsonValue) => void; idPrefix?: string }) {
  const helpId = useId();
  const describedBy = descriptor.help ? helpId : undefined;
  const id = idPrefix ? `${idPrefix}-${descriptor.key}` : undefined;
  if (descriptor.type === "checkbox") return <label className="field checkbox-field" htmlFor={id}><input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /><span>{descriptor.label}{descriptor.required ? " *" : ""}</span>{descriptor.help && <small className="muted" id={helpId}>{descriptor.help}</small>}</label>;
  if (descriptor.options?.length) return <label className="field" htmlFor={id}><span>{descriptor.label}{descriptor.required ? " *" : ""}</span><select id={id} className="input" value={valueString(value)} onChange={(event) => onChange(event.target.value)} aria-describedby={describedBy}>{!descriptor.required && <option value="">Select an option</option>}{descriptor.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{descriptor.help && <small className="muted" id={helpId}>{descriptor.help}</small>}</label>;
  return <label className="field" htmlFor={id}><span>{descriptor.label}{descriptor.required ? " *" : ""}</span><input id={id} className="input" type={inputType(descriptor)} inputMode={inputMode(descriptor)} value={valueString(value)} onChange={(event) => onChange(event.target.value)} aria-describedby={describedBy} required={descriptor.required} />{descriptor.help && <small className="muted" id={helpId}>{descriptor.help}</small>}</label>;
}

function RankField({ descriptor, value, onChange }: { descriptor: FieldDescriptor; value: JsonValue | undefined; onChange: (next: JsonValue) => void }) {
  const selected = Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : "").slice(0, 3) : [];
  const rankings = Array.from({ length: 3 }, (_, index) => selected[index] ?? "");
  const labels = ["First priority", "Second priority", "Third priority"];
  function choose(index: number, next: string) {
    const nextRankings = [...rankings];
    nextRankings[index] = next;
    onChange(nextRankings);
  }
  return <fieldset className="field" aria-describedby={descriptor.help ? `${descriptor.key}-help` : undefined}>
    <legend className="field-label">{descriptor.label}{descriptor.required ? " *" : ""}</legend>
    <div className="form-grid">
      {rankings.map((ranking, index) => <label className="field" key={labels[index]}><span>{labels[index]}</span><select className="input" value={ranking} onChange={(event) => choose(index, event.target.value)}><option value="">Select a concern</option>{descriptor.options?.map((option) => <option key={option.value} value={option.value} disabled={option.value !== ranking && rankings.includes(option.value)}>{option.label}</option>)}</select></label>)}
    </div>
    {descriptor.help && <small className="muted" id={`${descriptor.key}-help`}>{descriptor.help}</small>}
  </fieldset>;
}

function RepeatableField({ descriptor, value, onChange }: { descriptor: FieldDescriptor; value: JsonValue | undefined; onChange: (next: JsonValue) => void }) {
  const rows = Array.isArray(value) ? value.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
  const childFields = descriptor.fields ?? [];
  function updateRow(index: number, key: string, next: JsonValue) {
    const nextRows = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: next } : row);
    onChange(nextRows);
  }
  function addRow() {
    const row = Object.fromEntries(childFields.map((field) => [field.key, emptyValue(field)])) as JsonRecord;
    onChange([...rows, row]);
  }
  function removeRow(index: number) { onChange(rows.filter((_, rowIndex) => rowIndex !== index)); }
  return <fieldset className="field" aria-describedby={descriptor.help ? `${descriptor.key}-help` : undefined}>
    <legend className="field-label">{descriptor.label}{descriptor.required ? " *" : ""}</legend>
    {descriptor.help && <small className="muted" id={`${descriptor.key}-help`}>{descriptor.help}</small>}
    {rows.map((row, index) => <div className="repeat-row" key={`${descriptor.key}-${index}`}>
      <div className="form-grid">{childFields.map((field) => <BasicDescriptorInput key={field.key} descriptor={field} value={row[field.key]} onChange={(next) => updateRow(index, field.key, next)} idPrefix={`${descriptor.key}-${index}`} />)}</div>
      <button className="button button-secondary button-small" type="button" onClick={() => removeRow(index)} aria-label={`Remove ${descriptor.label} ${index + 1}`}>Remove</button>
    </div>)}
    {!rows.length && <p className="muted">No entries added.</p>}
    <button className="button button-secondary button-small" type="button" onClick={addRow}>Add {descriptor.label.endsWith("s") ? descriptor.label.slice(0, -1) : descriptor.label}</button>
  </fieldset>;
}

function RiskAnswersField({ descriptor, value, onChange }: { descriptor: FieldDescriptor; value: JsonValue | undefined; onChange: (next: JsonValue) => void }) {
  const answers = Array.isArray(value) ? value.map((answer) => typeof answer === "number" ? answer : Number(answer)).slice(0, 5) : [];
  function choose(question: number, answer: number) {
    const nextAnswers = Array.from({ length: 5 }, (_, index) => answers[index] || 0);
    nextAnswers[question] = answer;
    onChange(nextAnswers);
  }
  return <fieldset className="field" aria-describedby={descriptor.help ? `${descriptor.key}-help` : undefined}>
    <legend className="field-label">{descriptor.label}{descriptor.required ? " *" : ""}</legend>
    <p className="muted">Record one answer from 1 to 5 for each risk question.</p>
    {Array.from({ length: 5 }, (_, question) => <fieldset className="repeat-row" key={question}>
      <legend className="field-label">Question {question + 1}</legend>
      <div className="radio-group">{[1, 2, 3, 4, 5].map((answer) => <label className="radio-option" key={answer}><input type="radio" name={`${descriptor.key}-${question}`} value={answer} checked={answers[question] === answer} onChange={() => choose(question, answer)} />{answer}</label>)}</div>
    </fieldset>)}
    {descriptor.help && <small className="muted" id={`${descriptor.key}-help`}>{descriptor.help}</small>}
  </fieldset>;
}

function DescriptorField({ descriptor, data, onChange }: { descriptor: FieldDescriptor; data: JsonRecord; onChange: (next: JsonRecord) => void }) {
  const path = descriptor.key.split(".");
  const value = getAtPath(data, path);
  const update = (next: JsonValue) => onChange(setAtPath(data, path, next));
  if (!shown(descriptor, data)) return null;
  if (descriptor.type === "review") return null;
  if (descriptor.type === "file") return <div className="field descriptor-file"><span>{descriptor.label}</span><p className="muted">Private uploads are managed above through the authorized document action.</p>{descriptor.help && <small className="muted">{descriptor.help}</small>}</div>;
  // Submitted consent is immutable in the advisor workspace; the save schema requires true.
  if (descriptor.key === "consent") return <div className="field"><span>{descriptor.label}</span><label className="checkbox-label"><input type="checkbox" checked={value === true} readOnly disabled /><span>Consent was recorded when this intake was submitted and cannot be changed here.</span></label></div>;
  if (descriptor.type === "rank") return <RankField descriptor={descriptor} value={value} onChange={update} />;
  if (descriptor.type === "repeatable") return <RepeatableField descriptor={descriptor} value={value} onChange={update} />;
  if (descriptor.key === "riskAnswers" && descriptor.type === "radio" && !descriptor.options) return <RiskAnswersField descriptor={descriptor} value={value} onChange={update} />;
  return <BasicDescriptorInput descriptor={descriptor} value={value} onChange={update} />;
}

function StepFields({ step, data, onChange }: { step: (typeof steps)[number]; data: JsonRecord; onChange: (next: JsonRecord) => void }) {
  const applicable = step.fields.filter((descriptor) => descriptor.type !== "review" && shown(descriptor, data));
  const directFields = applicable.filter((descriptor) => !descriptor.key.startsWith("spouse."));
  const spouseFields = applicable.filter((descriptor) => descriptor.key.startsWith("spouse."));
  const married = getAtPath(data, ["maritalStatus"]) === "MARRIED";
  if (!directFields.length && (!married || !spouseFields.length)) return null;
  return <section className="profile-step review-section" aria-labelledby={`profile-step-${step.number}`}>
    <header><p className="eyebrow">Step {step.number}</p><h3 id={`profile-step-${step.number}`}>{step.title}</h3><p className="muted">{step.description}</p></header>
    {directFields.length > 0 && <div className="form-grid">{directFields.map((descriptor) => <DescriptorField key={descriptor.key} descriptor={descriptor} data={data} onChange={onChange} />)}</div>}
    {married && spouseFields.length > 0 && <fieldset className="repeat-row"><legend className="field-label">Spouse details</legend><div className="form-grid">{spouseFields.map((descriptor) => <DescriptorField key={descriptor.key} descriptor={descriptor} data={data} onChange={onChange} />)}</div></fieldset>}
  </section>;
}

/** Uses the shared intake descriptors and preserves their eight-step structure. */
export function ProfileEditor({ data, onChange }: { data: JsonRecord; onChange: (next: JsonRecord) => void }) {
  return <section className="profile-editor"><p className="muted">Field labels, options, conditional visibility, and repeatable row definitions come from the shared intake contract. The server validates every submitted change.</p>{steps.map((step) => <StepFields key={step.number} step={step} data={data} onChange={onChange} />)}</section>;
}
