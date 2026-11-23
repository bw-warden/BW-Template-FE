"use client";

import { useEffect, useState } from "react";

type Props = {
  label: string;
  /** Rough duration of the slow call. The bar eases toward 95% over this time. */
  expectedMs?: number;
  /** Optional captions shown as the bar advances, e.g. for multi-step work. */
  stages?: string[];
};

export function ProgressBar({ label, expectedMs = 8000, stages = [] }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 150);
    return () => clearInterval(t);
  }, []);

  // Exponential approach: never reaches 100% until the work actually finishes.
  const pct = Math.min(95, 100 * (1 - Math.exp(-elapsed / (expectedMs / 2.3))));
  const stage = stages.length
    ? stages[Math.min(stages.length - 1, Math.floor((pct / 95) * stages.length))]
    : null;
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="progress-head">
        <span>{label}</span>
        <span className="muted">{seconds}s</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={label}
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {stage && <div className="muted progress-stage">{stage}</div>}
    </div>
  );
}
