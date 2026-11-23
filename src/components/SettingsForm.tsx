"use client";

import { useEffect, useState } from "react";
import {
  CollectionAccessEditor,
  type GroupOption,
} from "@/components/CollectionAccessEditor";
import type { CollectionAccessGrant } from "@/lib/collection-access";

type Masked = {
  configured: boolean;
  region: "us" | "eu";
  orgId: string;
  orgApiClientId: string;
  orgApiClientSecret: { configured: boolean; last4: string | null };
  vaultApiClientId: string;
  vaultApiClientSecret: { configured: boolean; last4: string | null };
  vaultMasterPassword: { configured: boolean; last4: string | null };
  clientsRootName: string;
  templatesRootName: string;
  softwareAccess: CollectionAccessGrant[];
  hardwareAccess: CollectionAccessGrant[];
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
  softwareAccess: CollectionAccessGrant[];
  hardwareAccess: CollectionAccessGrant[];
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
  softwareAccess: [],
  hardwareAccess: [],
};

function formatSyncedAt(iso: string | null) {
  if (!iso) return "Never synced";
  try {
    return `Last synced ${new Date(iso).toLocaleString()}`;
  } catch {
    return `Last synced ${iso}`;
  }
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
        softwareAccess: data.softwareAccess || [],
        hardwareAccess: data.hardwareAccess || [],
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
      const payload: Record<string, unknown> = {
        region: form.region,
        orgId: form.orgId,
        orgApiClientId: form.orgApiClientId,
        clientsRootName: form.clientsRootName,
        templatesRootName: form.templatesRootName,
        softwareAccess: form.softwareAccess,
        hardwareAccess: form.hardwareAccess,
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
        softwareAccess: data.softwareAccess || prev.softwareAccess,
        hardwareAccess: data.hardwareAccess || prev.hardwareAccess,
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
                  ? `Configured ···${masked.orgApiClientSecret.last4}`
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
                  ? `Configured ···${masked.vaultApiClientSecret.last4}`
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
                  ? `Configured ···${masked.vaultMasterPassword.last4}`
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
          <h2 className="panel-title">Default collection access</h2>
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
          Bitwarden collection permissions (Can view / Can view, except
          passwords / Can edit / Can manage). Applied when a new client&apos;s
          Software or Hardware collection is created. Existing clients are
          managed on the Clients tab.
        </p>
        <div className="access-editors">
          <CollectionAccessEditor
            title="Software"
            grants={form.softwareAccess}
            groups={groups}
            disabled={saving}
            onChange={(softwareAccess) => setField("softwareAccess", softwareAccess)}
          />
          <CollectionAccessEditor
            title="Hardware"
            grants={form.hardwareAccess}
            groups={groups}
            disabled={saving}
            onChange={(hardwareAccess) => setField("hardwareAccess", hardwareAccess)}
          />
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Collection roots</h2>
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
