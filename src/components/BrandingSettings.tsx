"use client";

import { useEffect, useRef, useState } from "react";

export function BrandingSettings() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasLogo, setHasLogo] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branding/logo", { method: "HEAD" });
      setHasLogo(res.ok);
      setPreviewKey((k) => k + 1);
    } catch {
      setHasLogo(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const body = new FormData();
      body.append("logo", file);
      const res = await fetch("/api/branding/logo", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setHasLogo(true);
      setPreviewKey((k) => k + 1);
      setMessage("Logo saved. It appears in the header, login, and setup pages.");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/branding/logo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setHasLogo(false);
      setPreviewKey((k) => k + 1);
      setMessage("Custom logo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <div>
        <h2 className="section-title">Branding</h2>
        <p className="muted">
          Optional organization logo for the header and sign-in screens. PNG,
          JPEG, or WebP up to 2MB. The Bitwarden footer logo is unchanged.
        </p>
      </div>
      {error && <div className="banner banner-error">{error}</div>}
      {message && <div className="banner banner-ok">{message}</div>}
      {loading ? (
        <p className="muted">Loading branding…</p>
      ) : (
        <>
          {hasLogo ? (
            <div className="brand-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={previewKey}
                src={`/api/branding/logo?v=${previewKey}`}
                alt="Current organization logo"
                height={48}
              />
            </div>
          ) : (
            <p className="muted">No custom logo uploaded. Text brand is shown.</p>
          )}
          <div className="row gap">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            />
            {hasLogo && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void onRemove()}
              >
                {busy ? "Working…" : "Remove logo"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
