import { randomUUID } from "crypto";
import {
  AUDIT_ACTIONS,
  type AuditAction,
  auditActionLabel,
} from "@/lib/audit-labels";
import { getRedis, RedisKeys } from "@/lib/redis";

export { AUDIT_ACTIONS, auditActionLabel };
export type { AuditAction };

export const AUDIT_MAX_EVENTS = 10_000;

export type AuditEvent = {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  scope: string;
  detail: string;
};

export type AppendAuditInput = {
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  scope: string;
  detail: string;
};

export type ListAuditOpts = {
  q?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  /** Exclusive upper bound on score (ms) for pagination — events older than this. */
  before?: number;
};

export type ListAuditResult = {
  events: AuditEvent[];
  total: number;
  totalsByAction: Record<string, number>;
  nextBefore: number | null;
};

function parseEvent(raw: string | null): AuditEvent | null {
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as AuditEvent;
    if (!e?.id || !e.at || !e.action) return null;
    return e;
  } catch {
    return null;
  }
}

/** Append an audit event. Failures are logged and never thrown (writes must not break). */
export async function appendAuditEvent(input: AppendAuditInput): Promise<void> {
  try {
    const redis = await getRedis();
    const id = randomUUID();
    const atMs = Date.now();
    const event: AuditEvent = {
      id,
      at: new Date(atMs).toISOString(),
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: input.action,
      scope: input.scope.slice(0, 500),
      detail: input.detail.slice(0, 2000),
    };

    const pipe = redis.pipeline();
    pipe.set(RedisKeys.auditEvent(id), JSON.stringify(event));
    pipe.zadd(RedisKeys.auditIds, atMs, id);
    await pipe.exec();

    const count = await redis.zcard(RedisKeys.auditIds);
    if (count > AUDIT_MAX_EVENTS) {
      const excess = count - AUDIT_MAX_EVENTS;
      const oldIds = await redis.zrange(RedisKeys.auditIds, 0, excess - 1);
      if (oldIds.length) {
        const trim = redis.pipeline();
        for (const oldId of oldIds) {
          trim.del(RedisKeys.auditEvent(oldId));
        }
        trim.zremrangebyrank(RedisKeys.auditIds, 0, excess - 1);
        await trim.exec();
      }
    }
  } catch (err) {
    console.error(
      "[audit] append failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function matchesFilters(
  event: AuditEvent,
  opts: { q?: string; action?: string; fromMs?: number; toMs?: number },
): boolean {
  if (opts.action && event.action !== opts.action) return false;
  const atMs = Date.parse(event.at);
  if (opts.fromMs != null && !Number.isNaN(atMs) && atMs < opts.fromMs) {
    return false;
  }
  if (opts.toMs != null && !Number.isNaN(atMs) && atMs > opts.toMs) {
    return false;
  }
  if (opts.q) {
    const hay = `${event.actorEmail} ${event.action} ${event.scope} ${event.detail}`.toLowerCase();
    if (!hay.includes(opts.q)) return false;
  }
  return true;
}

export async function listAuditEvents(
  opts: ListAuditOpts = {},
): Promise<ListAuditResult> {
  const redis = await getRedis();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const q = opts.q?.trim().toLowerCase() || undefined;
  const action = opts.action?.trim() || undefined;
  const fromMs = opts.from ? Date.parse(opts.from) : undefined;
  const toMs = opts.to ? Date.parse(opts.to) : undefined;
  const fromOk = fromMs != null && !Number.isNaN(fromMs) ? fromMs : undefined;
  const toOk = toMs != null && !Number.isNaN(toMs) ? toMs : undefined;

  const maxScore =
    opts.before != null && Number.isFinite(opts.before)
      ? `(${opts.before}`
      : "+inf";
  const minScore = fromOk != null ? String(fromOk) : "-inf";

  // Pull a window large enough to filter; paginate by score cursor.
  const fetchCount = Math.min(limit * 5, 2000);
  const ids = await redis.zrevrangebyscore(
    RedisKeys.auditIds,
    maxScore,
    minScore,
    "LIMIT",
    0,
    fetchCount,
  );

  const events: AuditEvent[] = [];
  if (ids.length) {
    const pipe = redis.pipeline();
    for (const id of ids) pipe.get(RedisKeys.auditEvent(id));
    const rows = await pipe.exec();
    for (const result of rows ?? []) {
      const raw = result?.[1];
      const event = parseEvent(typeof raw === "string" ? raw : null);
      if (!event) continue;
      if (
        !matchesFilters(event, {
          q,
          action,
          fromMs: fromOk,
          toMs: toOk,
        })
      ) {
        continue;
      }
      events.push(event);
      if (events.length >= limit) break;
    }
  }

  // Totals over the filtered window (scan up to cap for stats).
  const allIds = await redis.zrevrangebyscore(
    RedisKeys.auditIds,
    toOk != null ? String(toOk) : "+inf",
    fromOk != null ? String(fromOk) : "-inf",
    "LIMIT",
    0,
    AUDIT_MAX_EVENTS,
  );
  const totalsByAction: Record<string, number> = {};
  let total = 0;
  if (allIds.length) {
    const pipe = redis.pipeline();
    for (const id of allIds) pipe.get(RedisKeys.auditEvent(id));
    const rows = await pipe.exec();
    for (const result of rows ?? []) {
      const raw = result?.[1];
      const event = parseEvent(typeof raw === "string" ? raw : null);
      if (!event) continue;
      if (!matchesFilters(event, { q, action, fromMs: fromOk, toMs: toOk })) {
        continue;
      }
      total += 1;
      totalsByAction[event.action] = (totalsByAction[event.action] || 0) + 1;
    }
  }

  const last = events[events.length - 1];
  const nextBefore = last ? Date.parse(last.at) : null;

  return {
    events,
    total,
    totalsByAction,
    nextBefore:
      nextBefore != null && !Number.isNaN(nextBefore) && events.length >= limit
        ? nextBefore
        : null,
  };
}
