"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      if (!data.hasAdmin) {
        router.replace("/setup");
        return;
      }
      if (data.authenticated) {
        router.replace("/");
        return;
      }
      setLoading(false);
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.replace("/");
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
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="auth-stage">
      <div className="auth-panel">
        <div className="auth-kicker">BW Konica</div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-copy">
          Local admin login for this test provisioner. Bitwarden credentials stay
          server-side.
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
