"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auditActionLabel } from "@/lib/audit-labels";

type ViewId = "hub" | "audit" | "client-search" | "client-report";

type AuditEvent = {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: string;
  scope: string;
  detail: string;
};

type ClientOption = {
  id: string;
  name: string;
  path: string;
  folders: Array<{ name: string; id: string }>;
};

type ReportGrant = {
  principalId: string;
  principal: string;
  kind: "Group" | "User";
  access: string;
  accessLabel: string;
};

type ReportFolderNode = {
  name: string;
  path: string;
  collectionId: string;
  items: Array<{ id: string; name: string; type: number }>;
  grants: ReportGrant[];
  children: ReportFolderNode[];
};

type ClientReport = {
  client: { id: string; name: string; path: string };
  tree: ReportFolderNode;
  summary: {
    folderCount: number;
    itemCount: number;
    principalCount: number;
  };
};

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string) => {
    if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };
  const body = rows.map((r) => r.map((c) => escape(String(c ?? ""))).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function itemTypeLabel(type: number) {
  switch (type) {
    case 1:
      return "Login";
    case 2:
      return "Secure note";
    case 3:
      return "Card";
    case 4:
      return "Identity";
    default:
      return `Type ${type}`;
  }
}

function flattenReportCsv(node: ReportFolderNode, rows: string[][]) {
  for (const item of node.items) {
    rows.push([
      node.path,
      "item",
      item.name,
      itemTypeLabel(item.type),
      "",
      "",
    ]);
  }
  for (const g of node.grants) {
    rows.push([
      node.path,
      "permission",
      "",
      "",
      `${g.kind}: ${g.principal}`,
      g.accessLabel,
    ]);
  }
  if (node.items.length === 0 && node.grants.length === 0) {
    rows.push([node.path, "folder", "", "", "", ""]);
  }
  for (const child of node.children) flattenReportCsv(child, rows);
}

function FolderReportBlock({
  node,
  depth = 0,
}: {
  node: ReportFolderNode;
  depth?: number;
}) {
  return (
    <div
      className="report-folder"
      style={depth ? { marginLeft: "1rem" } : undefined}
    >
      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title" style={{ fontSize: "1.05rem" }}>
            {depth === 0 ? node.path : node.name}
          </h3>
          <span className="muted">
            {node.items.length} item{node.items.length === 1 ? "" : "s"}
          </span>
        </div>
        {depth > 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>
            {node.path}
          </p>
        ) : null}

        <div className="report-folder-grid">
          <div>
            <h4 className="report-subhead">Items in this Shared Folder</h4>
            {node.items.length === 0 ? (
              <p className="muted">
                {depth === 0
                  ? "Root folder — items usually live in nested Shared Folders."
                  : "No items in this Shared Folder."}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="template-table report-readonly">
                  <thead>
                    <tr>
                      <th>Item name</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {node.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td className="muted">{itemTypeLabel(item.type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h4 className="report-subhead">Permissions</h4>
            {node.grants.length === 0 ? (
              <p className="muted">No group or user grants on this folder.</p>
            ) : (
              <div className="table-wrap">
                <table className="template-table report-readonly">
                  <thead>
                    <tr>
                      <th>Principal</th>
                      <th>Type</th>
                      <th>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {node.grants.map((g) => (
                      <tr key={`${g.kind}-${g.principalId}`}>
                        <td>{g.principal}</td>
                        <td>{g.kind}</td>
                        <td>{g.accessLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {node.children.map((child) => (
        <FolderReportBlock key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ReportsAdmin() {
  const [view, setView] = useState<ViewId>("hub");

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [totalsByAction, setTotalsByAction] = useState<Record<string, number>>(
    {},
  );
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const [report, setReport] = useState<ClientReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (actionFilter && actionFilter !== "all") {
        params.set("action", actionFilter);
      }
      if (from) params.set("from", `${from}T00:00:00.000`);
      if (to) params.set("to", `${to}T23:59:59.999`);
      params.set("limit", "200");
      const res = await fetch(`/api/audit?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load audit log");
      setAuditEvents(data.events || []);
      setAuditTotal(data.total ?? 0);
      setTotalsByAction(data.totalsByAction || {});
      if (Array.isArray(data.actions)) setAuditActions(data.actions);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuditLoading(false);
    }
  }, [q, actionFilter, from, to]);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setClientError(null);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load clients");
      setClients(data.clients || []);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : String(err));
    } finally {
      setClientsLoading(false);
    }
  }, []);

  async function runReport(clientId: string) {
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    setView("client-report");
    try {
      const res = await fetch(`/api/reports/clients/${encodeURIComponent(clientId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report");
      setReport(data as ClientReport);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    } finally {
      setReportLoading(false);
    }
  }

  useEffect(() => {
    if (view === "audit") void loadAudit();
  }, [view, loadAudit]);

  useEffect(() => {
    if (view === "client-search") void loadClients();
  }, [view, loadClients]);

  const clientMatches = useMemo(() => {
    const term = clientQuery.trim().toLowerCase();
    if (term.length < 2) return clients.slice(0, 12);
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.path.toLowerCase().includes(term),
    );
  }, [clients, clientQuery]);

  function exportAuditCsv() {
    downloadCsv("audit-log.csv", [
      ["When", "Actor", "Action", "Scope", "Detail"],
      ...auditEvents.map((e) => [
        e.at,
        e.actorEmail,
        auditActionLabel(e.action),
        e.scope,
        e.detail,
      ]),
    ]);
  }

  function exportReportCsv() {
    if (!report) return;
    const rows: string[][] = [
      ["Path", "Kind", "Item name", "Item type", "Principal", "Access"],
    ];
    flattenReportCsv(report.tree, rows);
    const slug = report.client.name.replace(/[^\w.-]+/g, "-").toLowerCase();
    downloadCsv(`client-report-${slug}.csv`, rows);
  }

  const nav = (
    <div className="btn-row report-subnav">
      <button
        type="button"
        className={`btn ${view === "hub" ? "btn-primary" : "btn-secondary"}`}
        onClick={() => setView("hub")}
      >
        Reports hub
      </button>
      <button
        type="button"
        className={`btn ${view === "audit" ? "btn-primary" : "btn-secondary"}`}
        onClick={() => setView("audit")}
      >
        Audit log
      </button>
      <button
        type="button"
        className={`btn ${
          view === "client-search" || view === "client-report"
            ? "btn-primary"
            : "btn-secondary"
        }`}
        onClick={() => setView("client-search")}
      >
        Client report
      </button>
    </div>
  );

  if (view === "hub") {
    return (
      <div className="stack">
        {nav}
        <div className="report-hub-grid">
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Full audit log</h2>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setView("audit")}
              >
                Open
              </button>
            </div>
            <p className="muted">
              Chronological record of provisions, client creates, access
              changes, template edits, settings updates, and sign-ins.
            </p>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Per-client report</h2>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setView("client-search")}
              >
                Open
              </button>
            </div>
            <p className="muted">
              Search a client, then inspect nested Shared Folders, vault item
              names, and group/user permissions on each folder.
            </p>
          </div>
        </div>
        <p className="muted">
          Audit events are recorded going forward (no backfill). Item reports
          show names only — secrets never leave the vault API response path.
        </p>
      </div>
    );
  }

  if (view === "audit") {
    return (
      <div className="stack">
        {nav}
        {auditError && <div className="banner banner-error">{auditError}</div>}

        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Audit log</h2>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={auditLoading || auditEvents.length === 0}
                onClick={exportAuditCsv}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={auditLoading}
                onClick={() => void loadAudit()}
              >
                {auditLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="table-toolbar report-filters">
            <label className="label">
              Search
              <input
                className="field"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Actor, client, action…"
              />
            </label>
            <label className="label">
              Action
              <select
                className="field"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="all">All actions</option>
                {auditActions.map((a) => (
                  <option key={a} value={a}>
                    {auditActionLabel(a)}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              From
              <input
                className="field"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="label">
              To
              <input
                className="field"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <div className="label" style={{ justifyContent: "flex-end" }}>
              <span className="muted">&nbsp;</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={auditLoading}
                onClick={() => void loadAudit()}
              >
                Apply
              </button>
            </div>
          </div>

          <div className="report-stats">
            <div className="report-stat">
              <strong>{auditTotal}</strong>
              <span className="muted">Events (filtered)</span>
            </div>
            <div className="report-stat">
              <strong>{totalsByAction["item.provision"] || 0}</strong>
              <span className="muted">Provisions</span>
            </div>
            <div className="report-stat">
              <strong>{totalsByAction["access.update"] || 0}</strong>
              <span className="muted">Access changes</span>
            </div>
            <div className="report-stat">
              <strong>{totalsByAction["client.create"] || 0}</strong>
              <span className="muted">Client creates</span>
            </div>
          </div>

          {auditLoading && auditEvents.length === 0 ? (
            <div className="empty">Loading audit log…</div>
          ) : auditEvents.length === 0 ? (
            <div className="empty">
              No audit events yet. Activity will appear here after provisions,
              access changes, and other admin actions.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="template-table report-readonly">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Scope</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="muted">{formatWhen(e.at)}</td>
                      <td>{e.actorEmail}</td>
                      <td>{auditActionLabel(e.action)}</td>
                      <td>{e.scope}</td>
                      <td>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === "client-search") {
    return (
      <div className="stack">
        {nav}
        {clientError && <div className="banner banner-error">{clientError}</div>}

        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Search clients</h2>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={clientsLoading}
              onClick={() => void loadClients()}
            >
              {clientsLoading ? "Loading…" : "Reload"}
            </button>
          </div>
          <label className="label">
            Client name
            <input
              className="field"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Type a client name…"
              autoFocus
            />
          </label>
          <p className="muted">
            Matches Shared Folder roots under Clients/. Type at least 2
            characters to narrow the list.
          </p>
        </div>

        {clientsLoading && clients.length === 0 ? (
          <div className="empty">Loading clients…</div>
        ) : clientMatches.length === 0 ? (
          <div className="empty">No matching clients.</div>
        ) : (
          <ul className="client-access-list">
            {clientMatches.map((c) => (
              <li key={c.id} className="client-access-item">
                <div className="client-access-body" style={{ padding: "0.85rem 1rem" }}>
                  <div className="panel-head" style={{ marginBottom: 0 }}>
                    <div>
                      <div className="client-access-name">{c.name}</div>
                      <div className="muted client-access-path">{c.path}</div>
                      <div className="muted" style={{ marginTop: "0.35rem" }}>
                        {c.folders.length} nested Shared Folder
                        {c.folders.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void runReport(c.id)}
                    >
                      Run report
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // client-report
  return (
    <div className="stack">
      {nav}
      {reportError && <div className="banner banner-error">{reportError}</div>}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setReport(null);
            setView("client-search");
          }}
        >
          Back to search
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!report || reportLoading}
          onClick={exportReportCsv}
        >
          Export CSV
        </button>
      </div>

      {reportLoading ? (
        <div className="empty">Building client report…</div>
      ) : report ? (
        <>
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                Client report — {report.client.name}
              </h2>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              {report.client.path}
            </p>
            <div className="report-stats">
              <div className="report-stat">
                <strong>{report.summary.folderCount}</strong>
                <span className="muted">Shared Folders</span>
              </div>
              <div className="report-stat">
                <strong>{report.summary.itemCount}</strong>
                <span className="muted">Vault items</span>
              </div>
              <div className="report-stat">
                <strong>{report.summary.principalCount}</strong>
                <span className="muted">Distinct principals</span>
              </div>
            </div>
            <p className="muted">
              Includes nested Shared Folders under the client root. Item list
              shows names only. Permissions reflect live Bitwarden collection
              access for groups and direct user grants.
            </p>
          </div>

          <h2 className="panel-title" style={{ margin: 0 }}>
            Shared Folder tree
          </h2>
          <FolderReportBlock node={report.tree} />
        </>
      ) : (
        <div className="empty">Select a client to run a report.</div>
      )}
    </div>
  );
}
