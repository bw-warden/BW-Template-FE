"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClientOption, ClientTypeahead } from "@/components/ClientTypeahead";
import { LoadingModal } from "@/components/LoadingModal";
import { NewItemModal, Target } from "@/components/NewItemModal";
import { ProgressBar } from "@/components/ProgressBar";

type SafeTemplate = {
  id: string;
  name: string;
  type: number;
  fields: Array<{ name: string; type: number; required?: boolean }>;
};

type AddedItem = { name: string; target: Target; at: number };

const ITEM_TYPE_LABELS: Record<number, string> = {
  1: "Login",
  2: "Secure note",
  3: "Card",
  4: "Identity",
  5: "SSH key",
};

function itemTypeLabel(type: number): string {
  return ITEM_TYPE_LABELS[type] ?? "Item";
}

const TARGET_LABEL: Record<Target, string> = {
  software: "Software",
  hardware: "Hardware",
};

const STEPS = ["Client", "Add items"] as const;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

type Loader = { label: string; detail?: string; error?: string | null };

export function ProvisionWizard({
  configured,
  isAdmin = false,
}: {
  configured: boolean;
  isAdmin?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<ClientOption[] | null>(null);
  const [client, setClient] = useState<ClientOption | null>(null);
  const [templates, setTemplates] = useState<SafeTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [filter, setFilter] = useState("");
  const [target, setTarget] = useState<Target>("software");
  const [counts, setCounts] = useState<Record<Target, number> | null>(null);
  const [bumped, setBumped] = useState<Target | null>(null);
  const [modalTemplate, setModalTemplate] = useState<SafeTemplate | null>(null);
  const [added, setAdded] = useState<AddedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loader, setLoader] = useState<Loader | null>(null);
  const templatesRequest = useRef<Promise<void> | null>(null);

  // One in-flight templates request shared by the background preload and client open.
  function ensureTemplates(): Promise<void> {
    if (!templatesRequest.current) {
      templatesRequest.current = getJson<{ templates: SafeTemplate[] }>("/api/templates")
        .then((data) => {
          setTemplates(data.templates || []);
          setTemplatesLoaded(true);
        })
        .catch((err) => {
          templatesRequest.current = null;
          throw err;
        });
    }
    return templatesRequest.current;
  }

  // Each loader run gets an id; cancelling bumps it so late results are ignored.
  const opRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  function startOp(next: Loader): { id: number; signal: AbortSignal } {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    opRef.current += 1;
    setLoader(next);
    return { id: opRef.current, signal: controller.signal };
  }

  const isCurrent = (id: number) => opRef.current === id;

  function cancelLoader() {
    abortRef.current?.abort();
    abortRef.current = null;
    opRef.current += 1;
    setLoader(null);
  }

  async function loadClients() {
    setError(null);
    const op = startOp({ label: "Loading", detail: "Reading clients from Bitwarden" });
    try {
      const data = await getJson<{ clients: ClientOption[] }>("/api/clients", {
        signal: op.signal,
      });
      if (!isCurrent(op.id)) return;
      setClients(data.clients || []);
      setLoader(null);
      // Vault is unlocked now; warm templates so opening a client is quick.
      ensureTemplates().catch(() => {});
    } catch (err) {
      if (!isCurrent(op.id)) return;
      setLoader({
        label: "Loading",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  useEffect(() => {
    if (configured) void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  async function openClient(c: ClientOption) {
    setError(null);
    const op = startOp({ label: "Loading", detail: `Opening ${c.name}` });
    try {
      // Sequential: the vault CLI shares one session and sync state.
      await ensureTemplates();
      if (!isCurrent(op.id)) return;
      const data = await getJson<{ software: number; hardware: number }>(
        `/api/clients/${c.id}/counts`,
        { signal: op.signal },
      );
      if (!isCurrent(op.id)) return;
      setClient(c);
      setCounts({ software: data.software, hardware: data.hardware });
      setAdded([]);
      setFilter("");
      setStep(1);
      setLoader(null);
    } catch (err) {
      if (!isCurrent(op.id)) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoader(null);
    }
  }

  function addClient(created: ClientOption) {
    setClients((prev) =>
      prev && !prev.some((c) => c.id === created.id)
        ? [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        : prev,
    );
  }

  async function createClient(name: string) {
    setError(null);
    const op = startOp({
      label: `Creating ${name}`,
      detail: "Setting up Software and Hardware",
    });
    // Not aborted on cancel: the server finishes creating, so keep the result.
    let created: ClientOption;
    try {
      const data = await getJson<{ client: ClientOption }>("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      created = data.client;
    } catch (err) {
      if (!isCurrent(op.id)) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoader(null);
      return;
    }
    addClient(created);
    if (isCurrent(op.id)) await openClient(created);
  }

  const visibleTemplates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.fields.some((f) => f.name.toLowerCase().includes(q)),
    );
  }, [templates, filter]);

  function onSaved(result: { target: Target; count: number; name: string }) {
    setModalTemplate(null);
    setTarget(result.target);
    setCounts((prev) => ({
      software: prev?.software ?? 0,
      hardware: prev?.hardware ?? 0,
      [result.target]: result.count,
    }));
    setBumped(result.target);
    setTimeout(() => setBumped(null), 1200);
    setAdded((prev) => [
      { name: result.name, target: result.target, at: Date.now() },
      ...prev,
    ]);
  }

  async function refresh() {
    if (!client || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      // Counts sync the vault first, so the template list after it is current too.
      const countsData = await getJson<{ software: number; hardware: number }>(
        `/api/clients/${client.id}/counts?fresh=1`,
      );
      setCounts({ software: countsData.software, hardware: countsData.hardware });

      const tplData = await getJson<{ templates: SafeTemplate[] }>("/api/templates");
      setTemplates(tplData.templates || []);
      setTemplatesLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  function changeClient() {
    setStep(0);
    setError(null);
  }

  if (!configured) {
    return (
      <div className="banner banner-warn">
        {isAdmin
          ? "Bitwarden settings are incomplete. Open Settings, save org + vault credentials, then return here."
          : "Bitwarden is not connected yet. Ask an admin to finish Settings."}
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

      {error && (
        <div className="banner banner-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {step === 0 && clients && (
        <div className="panel">
          <h2 className="panel-title">Choose or create a client</h2>
          <ClientTypeahead
            clients={clients}
            value={client}
            disabled={Boolean(loader)}
            onSelect={(c) => void openClient(c)}
            onCreate={(name) => void createClient(name)}
          />
        </div>
      )}

      {step === 0 && !clients && !loader && (
        <div className="panel">
          <h2 className="panel-title">Choose or create a client</h2>
          <p className="muted">The client list hasn’t been loaded.</p>
          <button type="button" className="btn btn-primary" onClick={() => void loadClients()}>
            Load clients
          </button>
        </div>
      )}

      {loader && (
        <LoadingModal
          label={loader.label}
          detail={loader.detail}
          error={loader.error}
          onRetry={loader.error ? () => void loadClients() : undefined}
          onCancel={cancelLoader}
        />
      )}

      {step === 1 && client && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title" style={{ margin: 0 }}>
              Add items to {client.name}
            </h2>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={refreshing}
                onClick={() => void refresh()}
                title="Reload item counts and templates from Bitwarden"
              >
                {refreshing ? "Refreshing…" : "↻ Refresh"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={refreshing}
                onClick={changeClient}
              >
                Change client
              </button>
            </div>
          </div>
          {refreshing && (
            <ProgressBar
              label={`Refreshing ${client.name} from Bitwarden…`}
              expectedMs={9000}
              stages={["Syncing vault", "Counting items", "Reloading templates"]}
            />
          )}
          <p className="muted" style={{ marginTop: 6 }}>
            Choose a Shared Folder, then press + on a template to fill in a new item.
            Templates stay untouched.
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
                <div className="target-option-head">
                  <strong>{TARGET_LABEL[t]}</strong>
                  <span
                    className="count-badge"
                    data-bumped={bumped === t ? "true" : "false"}
                    aria-label={`${counts?.[t] ?? 0} items`}
                  >
                    {`${counts?.[t] ?? 0} item${counts?.[t] === 1 ? "" : "s"}`}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {templatesLoaded && templates.length === 0 && (
            <div className="empty">
              {isAdmin
                ? "No templates found. Add some on the Templates page."
                : "No templates are available yet. Ask an admin to add some."}
            </div>
          )}

          {templates.length > 0 && (
            <>
              <div className="table-toolbar">
                <input
                  className="field"
                  type="search"
                  placeholder="Filter templates…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label="Filter templates"
                />
              </div>

              <div className="table-wrap">
                <table className="template-table">
                  <thead>
                    <tr>
                      <th scope="col">Template</th>
                      <th scope="col">Type</th>
                      <th scope="col">Fields</th>
                      <th scope="col" className="col-action">
                        <span className="sr-only">Add</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTemplates.map((t) => (
                      <tr key={t.id} onClick={() => setModalTemplate(t)}>
                        <td className="template-name-cell">{t.name}</td>
                        <td className="muted">{itemTypeLabel(t.type)}</td>
                        <td>
                          {t.fields.length ? (
                            <div className="chips">
                              {t.fields.map((f) => (
                                <span
                                  key={`${t.id}-${f.name}`}
                                  className={f.required ? "chip chip-required" : "chip"}
                                  title={f.required ? "Required" : undefined}
                                >
                                  {f.name}
                                  {f.required ? <span className="req-mark"> *</span> : null}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted">None</span>
                          )}
                        </td>
                        <td className="col-action">
                          <button
                            type="button"
                            className="row-toggle"
                            aria-label={`New item from ${t.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalTemplate(t);
                            }}
                          >
                            +
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visibleTemplates.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          No templates match “{filter}”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {added.length > 0 && (
            <div className="added-log">
              <div className="modal-section-title">Added this session</div>
              <ul>
                {added.map((a) => (
                  <li key={a.at}>
                    <strong>{a.name}</strong>
                    <span className="muted"> → {TARGET_LABEL[a.target]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {modalTemplate && client && (
        <NewItemModal
          templateId={modalTemplate.id}
          templateName={modalTemplate.name}
          clientId={client.id}
          clientName={client.name}
          defaultTarget={target}
          onClose={() => setModalTemplate(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
