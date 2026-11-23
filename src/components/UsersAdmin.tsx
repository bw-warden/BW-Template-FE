"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "member";

type User = {
  id: string;
  email: string;
  role: Role;
  created_at: string;
};

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [creating, setCreating] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
      setCurrentUserId(data.currentUserId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createMember(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setUsers(data.users || []);
      setMessage(`Created ${role} ${email.trim().toLowerCase()}. Share the password with them securely.`);
      setEmail("");
      setPassword("");
      setRole("member");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function patchUser(id: string, body: { role?: Role; password?: string }) {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setUsers(data.users || []);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(user: User) {
    if (!window.confirm(`Delete ${user.email}? They will be signed out immediately.`)) {
      return;
    }
    setBusyId(user.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setUsers(data.users || []);
      setMessage(`Deleted ${user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function submitReset(user: User) {
    const ok = await patchUser(user.id, { password: resetPassword });
    if (ok) {
      setMessage(`Password updated for ${user.email}.`);
      setResetId(null);
      setResetPassword("");
    }
  }

  return (
    <div className="stack">
      {error && <div className="banner banner-error">{error}</div>}
      {message && <div className="banner banner-ok">{message}</div>}

      <form className="panel stack" onSubmit={createMember}>
        <h2 className="panel-title" style={{ margin: 0 }}>Add a user</h2>
        <div className="settings-grid two">
          <label className="label">
            Email
            <input
              className="field"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="label">
            Temporary password
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>
        <label className="label" style={{ maxWidth: 260 }}>
          Role
          <select
            className="field"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="member">Member: provision clients</option>
            <option value="admin">Admin: also templates, users, settings</option>
          </select>
        </label>
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? (
              <span className="status-inline">
                <span className="spinner" aria-hidden="true" /> Creating…
              </span>
            ) : (
              "Create user"
            )}
          </button>
        </div>
      </form>

      <div className="panel">
        <h2 className="panel-title">Users</h2>
        {loading ? (
          <div className="empty status-inline">
            <span className="spinner" aria-hidden="true" /> Loading users…
          </div>
        ) : (
          <div className="table-wrap">
            <table className="template-table users-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Created</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id}>
                      <td className="template-name-cell">
                        {u.email}
                        {isSelf && <span className="muted"> (you)</span>}
                      </td>
                      <td>
                        <select
                          className="field field-compact"
                          value={u.role}
                          disabled={isSelf || busy}
                          aria-label={`Role for ${u.email}`}
                          onChange={(e) =>
                            void patchUser(u.id, { role: e.target.value as Role })
                          }
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="muted">{formatDate(u.created_at)}</td>
                      <td>
                        {resetId === u.id ? (
                          <div className="btn-row">
                            <input
                              className="field field-compact"
                              type="password"
                              autoComplete="new-password"
                              placeholder="New password (8+)"
                              minLength={8}
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy || resetPassword.length < 8}
                              onClick={() => void submitReset(u)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setResetId(null);
                                setResetPassword("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="btn-row">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => {
                                setResetId(u.id);
                                setResetPassword("");
                              }}
                            >
                              Reset password
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busy}
                                onClick={() => void removeUser(u)}
                              >
                                Delete
                              </button>
                            )}
                            {busy && <span className="spinner" aria-hidden="true" />}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const d = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}
