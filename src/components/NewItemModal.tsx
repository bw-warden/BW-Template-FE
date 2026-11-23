"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";

export type Target = "software" | "hardware";

type Field = { name: string; value: string; type: number; required?: boolean };

type TemplateForm = {
  id: string;
  name: string;
  type: number;
  notes: string;
  login: { username: string; uris: string[]; hasTotp: boolean } | null;
  fields: Field[];
};

type Props = {
  templateId: string;
  templateName: string;
  clientId: string;
  clientName: string;
  defaultTarget: Target;
  onClose: () => void;
  onSaved: (result: { target: Target; count: number; name: string }) => void;
};

const TARGET_LABEL: Record<Target, string> = {
  software: "Software",
  hardware: "Hardware",
};

export function NewItemModal({
  templateId,
  templateName,
  clientId,
  clientName,
  defaultTarget,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [target, setTarget] = useState<Target>(defaultTarget);
  const [name, setName] = useState(templateName);
  const [notes, setNotes] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totp, setTotp] = useState("");
  const [uris, setUris] = useState<string[]>([""]);
  const [fields, setFields] = useState<Field[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/templates/${templateId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load template");
        if (cancelled) return;
        const t = data.template as TemplateForm;
        setForm(t);
        setName(t.name);
        setNotes(t.notes);
        setFields(t.fields);
        if (t.login) {
          setUsername(t.login.username);
          setUris(t.login.uris.length ? t.login.uris : [""]);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    if (form) firstInput.current?.focus();
  }, [form]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, saving]);

  function updateField(index: number, value: string) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, value } : f)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const missing = fields.filter((f) => f.required && f.type !== 2 && !f.value.trim());
    if (missing.length) {
      setSaveError(
        missing.length === 1
          ? `${missing[0].name} is required`
          : `These fields are required: ${missing.map((f) => f.name).join(", ")}`,
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          target,
          templateId,
          item: {
            name,
            notes,
            fields,
            login: form.login
              ? { username, password, totp, uris: uris.filter((u) => u.trim()) }
              : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved({ target, count: data.count, name: data.item.name });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-item-title"
        ref={dialogRef}
      >
        <div className="modal-header">
          <div>
            <div className="modal-kicker">New item from template</div>
            <h2 id="new-item-title" className="modal-title">
              {templateName}
            </h2>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {!form && !loadError && (
          <div className="modal-body">
            <ProgressBar label="Loading template fields…" expectedMs={6000} />
          </div>
        )}

        {loadError && (
          <div className="modal-body">
            <div className="banner banner-error">{loadError}</div>
          </div>
        )}

        {form && (
          <form onSubmit={save}>
            <div className="modal-body">
            <fieldset className="modal-fields stack" disabled={saving}>
              <fieldset className="modal-section">
                <legend className="modal-section-title">Collection</legend>
                <div className="target-toggle">
                  {(["software", "hardware"] as const).map((t) => (
                    <label
                      key={t}
                      className="target-option"
                      data-selected={target === t ? "true" : "false"}
                    >
                      <input
                        type="radio"
                        name="target"
                        className="sr-only"
                        checked={target === t}
                        onChange={() => setTarget(t)}
                      />
                      <strong>{TARGET_LABEL[t]}</strong>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="modal-section">
                <legend className="modal-section-title">Item details</legend>
                <label className="label">
                  Item name
                  <input
                    ref={firstInput}
                    className="field"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </fieldset>

              {form.login && (
                <fieldset className="modal-section">
                  <legend className="modal-section-title">Login credentials</legend>
                  <label className="label">
                    Username
                    <input
                      className="field"
                      autoComplete="off"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>
                  <label className="label">
                    Password
                    <div className="input-group">
                      <input
                        className="field"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setPassword(generatePassword());
                          setShowPassword(true);
                        }}
                      >
                        Generate
                      </button>
                    </div>
                  </label>
                  <label className="label">
                    Authenticator key (TOTP)
                    <input
                      className="field"
                      autoComplete="off"
                      placeholder={form.login.hasTotp ? "Template expects a TOTP key" : "Optional"}
                      value={totp}
                      onChange={(e) => setTotp(e.target.value)}
                    />
                  </label>
                  <div className="label">
                    Website (URI)
                    {uris.map((uri, i) => (
                      <div key={i} className="input-group">
                        <input
                          className="field"
                          placeholder="https://"
                          value={uri}
                          onChange={(e) =>
                            setUris((prev) =>
                              prev.map((u, j) => (j === i ? e.target.value : u)),
                            )
                          }
                        />
                        {uris.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-label="Remove URI"
                            onClick={() =>
                              setUris((prev) => prev.filter((_, j) => j !== i))
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() => setUris((prev) => [...prev, ""])}
                    >
                      Add website
                    </button>
                  </div>
                </fieldset>
              )}

              {fields.length > 0 && (
                <fieldset className="modal-section">
                  <legend className="modal-section-title">Custom fields</legend>
                  {fields.some((f) => f.required) && (
                    <p className="field-hint">Fields marked * are required.</p>
                  )}
                  {fields.map((f, i) => {
                    const required = Boolean(f.required) && f.type !== 2;
                    const mark = f.required ? (
                      <span className="req-mark" aria-hidden="true">
                        {" "}
                        *
                      </span>
                    ) : null;
                    return (
                    <label
                      key={`${f.name}-${i}`}
                      className={f.type === 2 ? "label label-inline" : "label"}
                    >
                      {f.type === 2 ? (
                        <>
                          <input
                            type="checkbox"
                            checked={f.value === "true"}
                            onChange={(e) =>
                              updateField(i, e.target.checked ? "true" : "false")
                            }
                          />
                          <span>
                            {f.name}
                            {mark}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            {f.name}
                            {mark}
                          </span>
                          {f.type === 1 ? (
                            <div className="input-group">
                              <input
                                className="field"
                                type={revealed[i] ? "text" : "password"}
                                autoComplete="new-password"
                                required={required}
                                value={f.value}
                                onChange={(e) => updateField(i, e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setRevealed((prev) => ({ ...prev, [i]: !prev[i] }))
                                }
                              >
                                {revealed[i] ? "Hide" : "Show"}
                              </button>
                            </div>
                          ) : (
                            <input
                              className="field"
                              required={required}
                              value={f.value}
                              onChange={(e) => updateField(i, e.target.value)}
                            />
                          )}
                        </>
                      )}
                    </label>
                    );
                  })}
                </fieldset>
              )}

              <fieldset className="modal-section">
                <legend className="modal-section-title">Additional options</legend>
                <label className="label">
                  Notes
                  <textarea
                    className="field"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </fieldset>

            </fieldset>
            </div>

            {(saving || saveError) && (
              <div className="modal-status">
                {saving && (
                  <ProgressBar
                    label={`Saving “${name}” to ${clientName} / ${TARGET_LABEL[target]}…`}
                    expectedMs={7000}
                    stages={[
                      "Reading template",
                      "Encrypting item",
                      "Saving to Bitwarden",
                      "Updating item count",
                    ]}
                  />
                )}
                {saveError && <div className="banner banner-error">{saveError}</div>}
              </div>
            )}

            <div className="modal-footer">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : `Save to ${TARGET_LABEL[target]}`}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function generatePassword(length = 20): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
