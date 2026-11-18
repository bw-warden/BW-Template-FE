"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      if (data.hasAdmin) {
        router.replace(data.authenticated ? "/" : "/login");
        return;
      }
      setLoading(false);
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      router.replace("/settings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="auth-stage">
        <p className="muted">Checking setup…</p>
      </div>
    );
  }

  return (
    <div className="auth-stage">
      <div className="auth-panel">
        <div className="auth-kicker">First load</div>
        <h1 className="auth-title">Create admin</h1>
        <p className="auth-copy">
          This locks the system. After you create the admin account, setup is
          disabled and every page requires login.
        </p>
        <form className="stack" onSubmit={onSubmit}>
          {error && <div className="banner banner-error">{error}</div>}
          <label className="label">
            Email
            <input
              className="field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="label">
            Password
            <input
              className="field"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="label">
            Confirm password
            <input
              className="field"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create admin account"}
          </button>
        </form>
      </div>
    </div>
  );
}
