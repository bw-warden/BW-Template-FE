"use client";

import { useEffect, useState } from "react";

type Field = { name: string; value: string; type: number };
type SafeTemplate = {
  id: string;
  name: string;
  type: number;
  fields: Array<{ name: string; type: number }>;
};

export function TemplatesAdmin({ configured }: { configured: boolean }) {
  const [templates, setTemplates] = useState<SafeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [fields, setFields] = useState<Field[]>([
    { name: "", value: "", type: 0 },
  ]);
  const [saving, setSaving] = useState(false);

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

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payloadFields = fields
        .filter((f) => f.name.trim())
        .map((f) => ({
          name: f.name.trim(),
          value: f.value,
          type: f.type,
        }));
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          notes,
          type: 2,
          fields: payloadFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setName("");
      setNotes("");
      setFields([{ name: "", value: "", type: 0 }]);
      setMessage(`Created template “${data.template.name}”`);
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
        <h2 className="panel-title">Create template</h2>
        <form className="stack" onSubmit={createTemplate}>
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
            {fields.map((field, index) => (
              <div key={index} className="settings-grid two">
                <label className="label">
                  Field name
                  <input
                    className="field"
                    value={field.name}
                    onChange={(e) => {
                      const next = [...fields];
                      next[index] = { ...field, name: e.target.value };
                      setFields(next);
                    }}
                  />
                </label>
                <label className="label">
                  Default value
                  <input
                    className="field"
                    value={field.value}
                    onChange={(e) => {
                      const next = [...fields];
                      next[index] = { ...field, value: e.target.value };
                      setFields(next);
                    }}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setFields((prev) => [...prev, { name: "", value: "", type: 0 }])
              }
            >
              Add field
            </button>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create template"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel-title">Existing templates</h2>
        {loading && <div className="empty">Loading…</div>}
        {!loading && templates.length === 0 && (
          <div className="empty">No templates yet.</div>
        )}
        <div className="template-grid">
          {templates.map((t) => (
            <div key={t.id} className="template-card" style={{ cursor: "default" }}>
              <div className="template-name">{t.name}</div>
              <div className="chips" style={{ marginBottom: 10 }}>
                {(t.fields.length ? t.fields : [{ name: "No fields", type: 0 }]).map(
                  (f) => (
                    <span key={`${t.id}-${f.name}`} className="chip">
                      {f.name}
                    </span>
                  ),
                )}
              </div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void remove(t.id, t.name)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
