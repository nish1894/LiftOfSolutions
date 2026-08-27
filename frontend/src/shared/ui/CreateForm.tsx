import { type FormEvent, useMemo, useState } from "react";

import { titleCase } from "../../features/platform/utils.ts";

export interface CreateFormField {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
  options?: string[];
}

interface CreateFormProps {
  fields: CreateFormField[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}

export default function CreateForm({ fields, submitLabel, onSubmit }: CreateFormProps) {
  const initial = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.name, field.defaultValue || ""])),
    [fields],
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      setValues(initial);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="platform-create" onSubmit={submit}>
      {fields.map((field) => (
        <label key={field.name}>
          <span>{field.label}</span>
          {field.type === "select" ? (
            <select
              value={values[field.name] ?? ""}
              onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
            >
              {(field.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type || "text"}
              value={values[field.name] ?? ""}
              onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
              placeholder={field.placeholder}
              required={field.required !== false}
              minLength={field.minLength}
            />
          )}
        </label>
      ))}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
      {error && <p className="status error">{error}</p>}
    </form>
  );
}
