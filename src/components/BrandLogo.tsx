"use client";

import { useEffect, useState } from "react";

export function BrandLogo({
  height = 36,
  className = "brand-logo",
}: {
  height?: number;
  className?: string;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branding/logo", { method: "HEAD" });
        if (!cancelled) setAvailable(res.ok);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src="/api/branding/logo"
      alt="Organization logo"
      height={height}
    />
  );
}
