type Bucket = { count: number; resetAt: number };

type GlobalRate = {
  __bwRateLimit?: Map<string, Bucket>;
};

const globalState = globalThis as typeof globalThis & GlobalRate;

function store(): Map<string, Bucket> {
  if (!globalState.__bwRateLimit) {
    globalState.__bwRateLimit = new Map();
  }
  return globalState.__bwRateLimit;
}

/**
 * Fixed-window rate limit. Returns true if the request is allowed.
 * In-memory only (per process) — sufficient for single-container deploys.
 */
export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const buckets = store();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) {
    return false;
  }
  current.count += 1;
  return true;
}

/** Client IP from common proxy headers, else a stable fallback. */
export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
