"use client";

import { useEffect, useState } from "react";
import {
  CollectionAccessEditor,
  type GroupOption,
} from "@/components/CollectionAccessEditor";
import type { CollectionAccessGrant } from "@/lib/collection-access";

type NamedGrant = CollectionAccessGrant & { groupName?: string };

type ClientFolderAccess = {
  name: string;
  collectionId: string;
  groups: NamedGrant[];
};

type ClientAccess = {
  id: string;
  name: string;
  path: string;
  folders: ClientFolderAccess[];
};

function formatSyncedAt(iso: string | null) {
  if (!iso) return "Never synced";
  try {
    return `Last synced ${new Date(iso).toLocaleString()}`;
  } catch {
    return `Last synced ${iso}`;
  }
}

function toGrants(groups: NamedGrant[]): CollectionAccessGrant[] {
  return groups.map((g) => ({ groupId: g.groupId, access: g.access }));
}

function withNames(
  grants: CollectionAccessGrant[],
  groups: GroupOption[],
): NamedGrant[] {
  return grants.map((g) => ({
    ...g,
    groupName: groups.find((x) => x.id === g.groupId)?.name || g.groupId,
  }));
}

export function ClientsAdmin() {
  const [clients, setClients] = useState<ClientAccess[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, Record<string, CollectionAccessGrant[]>>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadClients(opts: { fresh?: boolean } = {}) {
    const qs = opts.fresh ? "?fresh=1" : "";
    const res = await fetch(`/api/clients/access${qs}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load clients");
    const list = (data.clients || []) as ClientAccess[];
    setClients(list);
    if (Array.isArray(data.groups)) {
      setGroups(
        data.groups.map((g: { id: string; name: string }) => ({
          id: g.id,
          name: g.name,
        })),
      );
    }
    if (data.syncedAt !== undefined) {
      setSyncedAt(data.syncedAt || null);
    }
    const nextDrafts: typeof drafts = {};
    for (const c of list) {
      const folderDrafts: Record<string, CollectionAccessGrant[]> = {};
      for (const folder of c.folders) {
        folderDrafts[folder.name] = toGrants(folder.groups);
      }
      nextDrafts[c.id] = folderDrafts;
    }
    setDrafts(nextDrafts);
  }

  async function load(opts: { fresh?: boolean } = {}) {
    setLoading(true);
    setError(null);
    try {
      await loadClients(opts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  function updateDraft(
    clientId: string,
    folderName: string,
    grants: CollectionAccessGrant[],
  ) {
    setDrafts((prev) => ({
      ...prev,
      [clientId]: {
        ...(prev[clientId] || {}),
        [folderName]: grants,
      },
    }));
  }

  async function saveAccess(client: ClientAccess) {
    setSavingId(client.id);
    setError(null);
    setMessage(null);
    try {
      const draft = drafts[client.id] || {};
      const folders = client.folders.map((folder) => ({
        name: folder.name,
        access: draft[folder.name] || [],
      }));
      const res = await fetch(`/api/clients/${client.id}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update access");

      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== client.id) return c;
          return {
            ...c,
            folders: c.folders.map((folder) => ({
              ...folder,
              groups: withNames(draft[folder.name] || [], groups),
            })),
          };
        }),
      );
      const names = client.folders.map((f) => f.name).join(", ");
      setMessage(
        names
          ? `Updated access for ${client.name} (${names}).`
          : `Updated access for ${client.name}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="empty">Loading clients…</div>;

  return (
    <div className="stack">
      {error && <div className="banner banner-error">{error}</div>}
      {message && <div className="banner banner-ok">{message}</div>}

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Clients</h2>
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
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading}
              onClick={() => void load({ fresh: true })}
            >
              {loading ? "Loading…" : "Reload clients"}
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Live nested Shared Folder permissions from Bitwarden (Can view / Can
          view, except passwords / Can edit / Can manage). Defaults for new
          clients are configured in Settings.
        </p>

        {clients.length === 0 ? (
          <div className="empty">No client Shared Folders found.</div>
        ) : (
          <ul className="client-access-list">
            {clients.map((client) => {
              const open = expandedId === client.id;
              const draft = drafts[client.id] || {};
              const saving = savingId === client.id;
              const canSave = client.folders.length > 0;
              return (
                <li key={client.id} className="client-access-item">
                  <button
                    type="button"
                    className="client-access-toggle"
                    aria-expanded={open}
                    onClick={() =>
                      setExpandedId(open ? null : client.id)
                    }
                  >
                    <span className="client-access-name">{client.name}</span>
                    <span className="muted client-access-path">{client.path}</span>
                    <span className="muted">{open ? "Hide" : "Edit"}</span>
                  </button>

                  {open && (
                    <div className="client-access-body">
                      {client.folders.length === 0 ? (
                        <p className="banner banner-warn">
                          No nested Shared Folders found for this client.
                        </p>
                      ) : (
                        <div className="access-editors">
                          {client.folders.map((folder) => (
                            <div
                              key={folder.collectionId}
                              className="access-editor-block"
                            >
                              <CollectionAccessEditor
                                title={folder.name}
                                grants={draft[folder.name] || []}
                                groups={groups}
                                disabled={saving}
                                onChange={(grants) =>
                                  updateDraft(client.id, folder.name, grants)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="btn-row" style={{ marginTop: "0.85rem" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={saving || !canSave}
                          onClick={() => void saveAccess(client)}
                        >
                          {saving ? "Saving…" : "Save access"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
