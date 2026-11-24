"use client";

import { useEffect, useState } from "react";
import {
  CollectionAccessEditor,
  type GroupOption,
} from "@/components/CollectionAccessEditor";
import type { CollectionAccessGrant } from "@/lib/collection-access";
import type { DefaultSharedFolder } from "@/lib/settings";

type Masked = {
  configured: boolean;
  region: "us" | "eu";
  orgId: string;
  orgApiClientId: string;
  orgApiClientSecret: { configured: boolean };
  vaultApiClientId: string;
  vaultApiClientSecret: { configured: boolean };
  vaultMasterPassword: { configured: boolean };
  clientsRootName: string;
  templatesRootName: string;
  defaultFolders: DefaultSharedFolder[];
};

type FormState = {
  region: "us" | "eu";
  orgId: string;
  orgApiClientId: string;
  orgApiClientSecret: string;
  vaultApiClientId: string;
  vaultApiClientSecret: string;
  vaultMasterPassword: string;
  clientsRootName: string;
  templatesRootName: string;
  defaultFolders: DefaultSharedFolder[];
};

const emptyForm: FormState = {
  region: "us",
  orgId: "",
  orgApiClientId: "",
  orgApiClientSecret: "",
  vaultApiClientId: "",
  vaultApiClientSecret: "",
  vaultMasterPassword: "",
  clientsRootName: "Clients",
  templatesRootName: "Templates",
  defaultFolders: [
    { name: "Software", access: [] },
    { name: "Hardware", access: [] },
  ],
};

function formatSyncedAt(iso: string | null) {
  if (!iso) return "Never synced";
  try {
    return `Last synced ${new Date(iso).toLocaleString()}`;
  } catch {
    return `Last synced ${iso}`;
  }
}

function normalizeFolderName(name: string) {
  return name.trim();
}

export function SettingsForm() {
  const [masked, setMasked] = useState<Masked | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function loadGroups() {
    const res = await fetch("/api/groups");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load groups");
    setGroups(
      (data.groups || []).map((g: { id: string; name: string }) => ({
        id: g.id,
        name: g.name,
      })),
    );
    setSyncedAt(data.syncedAt || null);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settings");
      setMasked(data);
      setForm({
        region: data.region || "us",
        orgId: data.orgId || "",
        orgApiClientId: data.orgApiClientId || "",
        orgApiClientSecret: "",
        vaultApiClientId: data.vaultApiClientId || "",
        vaultApiClientSecret: "",
        vaultMasterPassword: "",
        clientsRootName: data.clientsRootName || "Clients",
        templatesRootName: data.templatesRootName || "Templates",
        defaultFolders:
          data.defaultFolders?.length > 0
            ? data.defaultFolders
            : emptyForm.defaultFolders,
      });
      await loadGroups().catch(() => {
        setGroups([]);
        setSyncedAt(null);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function renameFolder(index: number, name: string) {
    setForm((prev) => {
      const defaultFolders = prev.defaultFolders.map((f, i) =>
        i === index ? { ...f, name } : f,
      );
      return { ...prev, defaultFolders };
    });
  }

  function setFolderAccess(index: number, access: CollectionAccessGrant[]) {
    setForm((prev) => {
      const defaultFolders = prev.defaultFolders.map((f, i) =>
        i === index ? { ...f, access } : f,
      );
      return { ...prev, defaultFolders };
    });
  }

  function removeFolder(index: number) {
    setForm((prev) => ({
      ...prev,
      defaultFolders: prev.defaultFolders.filter((_, i) => i !== index),
    }));
  }

  function addFolder() {
    const name = normalizeFolderName(newFolderName);
    setError(null);
    if (!name) {
      setError("Folder name is required");
      return;
    }
    if (name.includes("/")) {
      setError("Folder name cannot contain '/'");
      return;
    }
    const exists = form.defaultFolders.some(
      (f) => f.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setError(`A default folder named “${name}” already exists`);
      return;
    }
    setForm((prev) => ({
      ...prev,
      defaultFolders: [...prev.defaultFolders, { name, access: [] }],
    }));
    setNewFolderName("");
  }

  async function refreshGroups() {
    setRefreshingGroups(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/groups/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to refresh groups");
      setGroups(
        (data.groups || []).map((g: { id: string; name: string }) => ({
          id: g.id,
          name: g.name,
        })),
      );
      setSyncedAt(data.syncedAt || null);
      setMessage(`Loaded ${data.groups?.length ?? 0} groups from Bitwarden.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingGroups(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const folders = form.defaultFolders.map((f) => ({
        ...f,
        name: normalizeFolderName(f.name),
      }));
      for (const f of folders) {
        if (!f.name) throw new Error("Every default folder needs a name");
        if (f.name.includes("/")) {
          throw new Error("Folder names cannot contain '/'");
        }
      }
      const seen = new Set<string>();
      for (const f of folders) {
        const key = f.name.toLowerCase();
        if (seen.has(key)) {
          throw new Error(`Duplicate default folder name: ${f.name}`);
        }
        seen.add(key);
      }

      const payload: Record<string, unknown> = {
        region: form.region,
        orgId: form.orgId,
        orgApiClientId: form.orgApiClientId,
        clientsRootName: form.clientsRootName,
        templatesRootName: form.templatesRootName,
        defaultFolders: folders,
      };
      if (form.orgApiClientSecret.trim()) {
        payload.orgApiClientSecret = form.orgApiClientSecret.trim();
      }
      if (form.vaultApiClientId.trim()) {
        payload.vaultApiClientId = form.vaultApiClientId.trim();
      }
      if (form.vaultApiClientSecret.trim()) {
        payload.vaultApiClientSecret = form.vaultApiClientSecret.trim();
      }
      if (form.vaultMasterPassword.trim()) {
        payload.vaultMasterPassword = form.vaultMasterPassword.trim();
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMasked(data);
      setForm((prev) => ({
        ...prev,
        orgApiClientSecret: "",
        vaultApiClientSecret: "",
        vaultMasterPassword: "",
        vaultApiClientId: data.vaultApiClientId || prev.vaultApiClientId,
        defaultFolders:
          data.defaultFolders?.length > 0
            ? data.defaultFolders
            : prev.defaultFolders,
      }));
      setMessage("Settings saved. Secrets remain encrypted server-side.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      setTestResult(
        [
          `Org API: ${data.org.ok ? "OK" : "FAIL"} — ${data.org.message}`,
          `Vault: ${data.vault.ok ? "OK" : "FAIL"} — ${data.vault.message}`,
        ].join("\n"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="empty">Loading settings…</div>;

  return (
    <form className="stack" onSubmit={save}>
      {error && <div className="banner banner-error">{error}</div>}
      {message && <div className="banner banner-ok">{message}</div>}
      {testResult && (
        <div
          className={`banner ${testResult.includes("FAIL") ? "banner-warn" : "banner-ok"}`}
          style={{ whiteSpace: "pre-wrap" }}
        >
          {testResult}
        </div>
      )}

      <div className="panel">
        <h2 className="panel-title">Cloud</h2>
        <div className="settings-grid two">
          <label className="label">
            Region
            <select
              className="field"
              value={form.region}
              onChange={(e) => setField("region", e.target.value as "us" | "eu")}
            >
              <option value="us">US (bitwarden.com)</option>
              <option value="eu">EU (bitwarden.eu)</option>
            </select>
          </label>
          <label className="label">
            Organization ID
            <input
              className="field"
              value={form.orgId}
              onChange={(e) => setField("orgId", e.target.value)}
              required
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Organization Public API</h2>
        <div className="settings-grid two">
          <label className="label">
            Client ID
            <input
              className="field"
              value={form.orgApiClientId}
              onChange={(e) => setField("orgApiClientId", e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="label">
            Client Secret
            <input
              className="field"
              type="password"
              value={form.orgApiClientSecret}
              placeholder={
                masked?.orgApiClientSecret.configured
                  ? "Configured (hidden)"
                  : "Paste to set / rotate"
              }
              onChange={(e) => setField("orgApiClientSecret", e.target.value)}
              autoComplete="new-password"
            />
            <span className="secret-hint">
              Leave blank to keep the current secret.
            </span>
          </label>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Vault service account</h2>
        <div className="settings-grid two">
          <label className="label">
            API Client ID
            <input
              className="field"
              value={form.vaultApiClientId}
              onChange={(e) => setField("vaultApiClientId", e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="label">
            API Client Secret
            <input
              className="field"
              type="password"
              value={form.vaultApiClientSecret}
              placeholder={
                masked?.vaultApiClientSecret.configured
                  ? "Configured (hidden)"
                  : "Paste to set / rotate"
              }
              onChange={(e) => setField("vaultApiClientSecret", e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="label">
            Master password
            <input
              className="field"
              type="password"
              value={form.vaultMasterPassword}
              placeholder={
                masked?.vaultMasterPassword.configured
                  ? "Configured (hidden)"
                  : "Paste to set / rotate"
              }
              onChange={(e) => setField("vaultMasterPassword", e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Default Shared Folder access</h2>
          <div className="btn-row">
            <span className="muted">{formatSyncedAt(syncedAt)}</span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={refreshingGroups}
              onClick={() => void refreshGroups()}
            >
              {refreshingGroups ? "Refreshing…" : "Refresh groups"}
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Bitwarden Shared Folder permissions (Can view / Can view, except
          passwords / Can edit / Can manage). Each default folder is created
          under a new client with these group assignments. Existing clients are
          managed on the Clients tab.
        </p>

        {form.defaultFolders.length === 0 ? (
          <p className="muted">
            No default folders yet. Add at least one so new clients get nested
            Shared Folders.
          </p>
        ) : (
          <div className="access-editors">
            {form.defaultFolders.map((folder, index) => (
              <div key={index} className="access-editor-block default-folder-card">
                <div className="default-folder-head">
                  <label className="label default-folder-name">
                    Folder name
                    <input
                      className="field"
                      value={folder.name}
                      disabled={saving}
                      onChange={(e) => renameFolder(index, e.target.value)}
                      aria-label={`Default folder ${index + 1} name`}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    disabled={saving}
                    onClick={() => removeFolder(index)}
                  >
                    Remove
                  </button>
                </div>
                <CollectionAccessEditor
                  title={folder.name.trim() || "Unnamed folder"}
                  grants={folder.access}
                  groups={groups}
                  disabled={saving}
                  onChange={(access) => setFolderAccess(index, access)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="default-folder-add">
          <input
            className="field"
            value={newFolderName}
            disabled={saving}
            placeholder="New folder name (e.g. Network)"
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFolder();
              }
            }}
            aria-label="New default folder name"
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saving || !newFolderName.trim()}
            onClick={addFolder}
          >
            Add default folder
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Shared Folder roots</h2>
        <div className="settings-grid two">
          <label className="label">
            Clients root name
            <input
              className="field"
              value={form.clientsRootName}
              onChange={(e) => setField("clientsRootName", e.target.value)}
            />
          </label>
          <label className="label">
            Templates root name
            <input
              className="field"
              value={form.templatesRootName}
              onChange={(e) => setField("templatesRootName", e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={testing}
          onClick={() => void testConnection()}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>
    </form>
  );
}
