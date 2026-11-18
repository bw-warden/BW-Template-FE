"use client";

import { useEffect, useState } from "react";
import { ClientOption, ClientTypeahead } from "@/components/ClientTypeahead";

type SafeTemplate = {
  id: string;
  name: string;
  type: number;
  fields: Array<{ name: string; type: number }>;
};

type ApplyResult = {
  ok: boolean;
  client: ClientOption;
  target: "software" | "hardware";
  results: Array<{
    templateId: string;
    ok: boolean;
    itemId?: string;
    name?: string;
    error?: string;
  }>;
};

const STEPS = ["Client", "Templates", "Confirm", "Result"] as const;

export function ProvisionWizard({ configured }: { configured: boolean }) {
  const [step, setStep] = useState(0);
  const [clientsRoot, setClientsRoot] = useState("Clients");
  const [client, setClient] = useState<ClientOption | null>(null);
  const [templates, setTemplates] = useState<SafeTemplate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<"software" | "hardware">("software");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    (async () => {
      setLoadingTemplates(true);
      try {
        const [clientsRes, templatesRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/templates"),
        ]);
        const clientsData = await clientsRes.json();
        const templatesData = await templatesRes.json();
        if (!cancelled) {
          if (clientsRes.ok) setClientsRoot(clientsData.clientsRoot || "Clients");
          if (templatesRes.ok) setTemplates(templatesData.templates || []);
          if (!templatesRes.ok) {
            setError(templatesData.error || "Failed to load templates");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  async function createClient(name: string) {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create client");
    return data.client as ClientOption;
  }

  function toggleTemplate(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function apply() {
    if (!client) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          target,
          templateIds: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      setResult(data as ApplyResult);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  function reset() {
    setStep(0);
    setSelected([]);
    setResult(null);
    setError(null);
  }

  if (!configured) {
    return (
      <div className="banner banner-warn">
        Bitwarden settings are incomplete. Open Settings, save org + vault
        credentials, then return here.
      </div>
    );
  }

  return (
    <div>
      <div className="stepper" aria-label="Provisioning steps">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className="step-pill"
            data-active={step === index ? "true" : "false"}
            data-done={step > index ? "true" : "false"}
          >
            {index + 1}. {label}
          </div>
        ))}
      </div>

      {error && <div className="banner banner-error" style={{ marginBottom: 16 }}>{error}</div>}

      {step === 0 && (
        <div className="panel">
          <h2 className="panel-title">Choose or create a client</h2>
          <ClientTypeahead
            clientsRoot={clientsRoot}
            value={client}
            onSelect={setClient}
            onCreate={createClient}
          />
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!client}
              onClick={() => setStep(1)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="panel">
          <h2 className="panel-title">Select templates & target</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Clones are created as new items in the chosen collection. Templates
            stay untouched.
          </p>

          <div className="target-toggle" style={{ marginBottom: 16 }}>
            {(["software", "hardware"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="target-option"
                data-selected={target === t ? "true" : "false"}
                onClick={() => setTarget(t)}
              >
                <strong>{t === "software" ? "Software" : "Hardware"}</strong>
                <div className="muted">
                  {clientsRoot} / {client?.name} /{" "}
                  {t === "software" ? "Software" : "Hardware"}
                </div>
              </button>
            ))}
          </div>

          {loadingTemplates && <div className="empty">Loading templates…</div>}
          {!loadingTemplates && templates.length === 0 && (
            <div className="empty">
              No templates found. Add items under Templates in Bitwarden (or use
              the Templates page).
            </div>
          )}

          <div className="template-grid">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="template-card"
                data-selected={selected.includes(t.id) ? "true" : "false"}
                onClick={() => toggleTemplate(t.id)}
                aria-pressed={selected.includes(t.id)}
              >
                <div className="template-name">{t.name}</div>
                <div className="chips">
                  {(t.fields.length ? t.fields : [{ name: "No custom fields", type: 0 }]).map(
                    (f) => (
                      <span key={`${t.id}-${f.name}`} className="chip">
                        {f.name}
                      </span>
                    ),
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep(0)}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selected.length === 0}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && client && (
        <div className="panel">
          <h2 className="panel-title">Confirm apply</h2>
          <p>
            Create <strong>{selected.length}</strong> new item
            {selected.length === 1 ? "" : "s"} in{" "}
            <code>
              {clientsRoot}/{client.name}/
              {target === "software" ? "Software" : "Hardware"}
            </code>
          </p>
          <ul>
            {templates
              .filter((t) => selected.includes(t.id))
              .map((t) => (
                <li key={t.id}>{t.name}</li>
              ))}
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={applying}
              onClick={() => void apply()}
            >
              {applying ? "Applying…" : "Apply templates"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="panel">
          <h2 className="panel-title">Result</h2>
          <div
            className={`banner ${result.ok ? "banner-ok" : "banner-warn"}`}
            style={{ marginBottom: 12 }}
          >
            {result.ok
              ? "All clones created successfully."
              : "Finished with some errors — see details below."}
          </div>
          <ul>
            {result.results.map((r) => (
              <li key={r.templateId}>
                {r.ok ? (
                  <>
                    Created <strong>{r.name}</strong> ({r.itemId})
                  </>
                ) : (
                  <>
                    Failed ({r.templateId}): {r.error}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Provision another
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setStep(1);
                setResult(null);
              }}
            >
              Add more to {result.client.name}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
