"use client";

import { useEffect } from "react";

type Props = {
  label?: string;
  detail?: string;
  error?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
};

export function LoadingModal({ label = "Loading", detail, error, onRetry, onCancel }: Props) {
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop modal-backdrop-center" role="presentation">
      <div
        className="modal loading-modal"
        role="alertdialog"
        aria-modal="true"
        aria-busy={!error}
        aria-live="polite"
      >
        {error ? (
          <div className="banner banner-error">{error}</div>
        ) : (
          <>
            <span className="spinner spinner-lg" aria-hidden="true" />
            <div className="loading-modal-label">{label}</div>
            {detail && <div className="muted">{detail}</div>}
          </>
        )}
        {(onRetry || onCancel) && (
          <div className="btn-row loading-modal-actions">
            {error && onRetry && (
              <button type="button" className="btn btn-primary" onClick={onRetry}>
                Retry
              </button>
            )}
            {onCancel && (
              <button type="button" className="btn btn-secondary" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
