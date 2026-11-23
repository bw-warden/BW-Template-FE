"use client";

import { useEffect, useRef, useState } from "react";

type Field = { name: string; value: string; type: number; required: boolean };

type SafeTemplate = {
  id: string;
  name: string;
  type: number;
  fields: Array<{ name: string; type: number; required?: boolean }>;
};

type TemplateForm = {
  id: string;
  name: string;
  notes: string;
  fields: Field[];
};

function emptyField(): Field {
  return { name: "", value: "", type: 0, required: false };
}

export function TemplatesAdmin({ configured }: { configured: boolean }) {
  const [templates, setTemplates] = useState<SafeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [fields, setFields] = useState<Field[]>([emptyField()]);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load templates");
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (configured) void load();
    else setLoading(false);
  }, [configured]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setNotes("");
    setFields([emptyField()]);
  }

  function updateField(index: number, patch: Partial<Field>) {
    setFields((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  async function startEdit(id: string) {
    setLoadingId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/templates/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load template");
      const template = data.template as TemplateForm;
      setEditingId(template.id);
      setName(template.name);
      setNotes(template.notes ?? "");
      setFields(
        template.fields.length
          ? template.fields.map((field) => ({
              name: field.name,
              value: field.value ?? "",
              type: field.type ?? 0,
              required: Boolean(field.required),
            }))
          : [emptyField()],
      );
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingId(null);
    }
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payloadFields = fields
        .filter((field) => field.name.trim())
        .map((field) => ({
          name: field.name.trim(),
          value: field.value,
          type: field.type,
          required: field.required,
        }));
      const res = await fetch(editingId ? `/api/templates/${editingId}` : "/api/templates", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          notes,
          type: 2,
          fields: payloadFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const verb = editingId ? "Updated" : "Created";
      resetForm();
      setMessage(`${verb} template “${data.template.name}”`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, templateName: string) {
    if (!confirm(`Delete template “${templateName}”?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (editingId === id) resetForm();
      setMessage(`Deleted “${templateName}”`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!configured) {
    return (
      <div className="banner banner-warn">
        Configure Bitwarden credentials in Settings before managing templates.
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="banner banner-error">{error}</div>}
      {message && <div className="banner banner-ok">{message}</div>}

      <div className="panel">
        <h2 className="panel-title">{editingId ? "Edit template" : "Create template"}</h2>
        <form className="stack" ref={formRef} onSubmit={saveTemplate}>
          <label className="label">
            Name
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="label">
            Notes
            <textarea
              className="field"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="stack">
            <div className="panel-title" style={{ fontSize: "0.95rem" }}>
              Custom fields
            </div>
            <p className="field-hint">
              Check Required when an operator must fill that field in before they can save an item
              from this template.
            </p>
            {fields.map((field, index) => (
              <div key={index} className="field-block">
                <div className="settings-grid two">
                  <label className="label">
                    Field name
                    <input
                      className="field"
                      value={field.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                    />
                  </label>
                  <label className="label">
                    Default value
                    <input
                      className="field"
                      value={field.value}
                      placeholder={
                        field.type === 1 ? "Hidden — leave blank to keep the saved value" : undefined
                      }
                      onChange={(e) => updateField(index, { value: e.target.value })}
                    />
                  </label>
                </div>
                <div className="field-block-meta">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setFields((prev) => [...prev, emptyField()])}
            >
              Add field
            </button>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save template" : "Create template"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel-title">Existing templates</h2>
        {loading && <div className="empty">Loading…</div>}
        {!loading && templates.length === 0 && (
          <div className="empty">No templates yet.</div>
        )}
        <div className="template-grid">
          {templates.map((template) => (
            <div
              key={template.id}
              className="template-card"
              data-selected={editingId === template.id ? "true" : "false"}
              style={{ cursor: "default" }}
            >
              <div className="template-name">{template.name}</div>
              <div className="chips" style={{ marginBottom: 10 }}>
                {(template.fields.length
                  ? template.fields
                  : [{ name: "No fields", type: 0, required: false }]
                ).map((field) => (
                  <span
                    key={`${template.id}-${field.name}`}
                    className={field.required ? "chip chip-required" : "chip"}
                    title={field.required ? "Required" : undefined}
                  >
                    {field.name}
                    {field.required ? <span className="req-mark"> *</span> : null}
                  </span>
                ))}
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={loadingId === template.id}
                  onClick={() => void startEdit(template.id)}
                >
                  {loadingId === template.id ? "Loading…" : "Edit"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => void remove(template.id, template.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
