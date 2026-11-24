import Redis from "ioredis";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const CONNECT_TIMEOUT_MS = 250;
const COMMAND_TIMEOUT_MS = 250;
const GROUPS_KEY = "bw:groups";
const GROUPS_TTL_SECONDS = 60 * 60; // 1 hour soft freshness
/** v2 keys hold AES-GCM ciphertext only (never plaintext tokens). */
const ORG_TOKEN_PREFIX = "bw:org-token-v2:";

type GlobalRedis = {
  __bwRedis?: Redis | null;
  __bwRedisDisabled?: boolean;
};

const globalState = globalThis as typeof globalThis & GlobalRedis;

function redisUrl(): string | undefined {
  const url = process.env.REDIS_URL?.trim();
  return url || undefined;
}

/** True when REDIS_URL is configured (cache may still fail open at runtime). */
export function isRedisConfigured(): boolean {
  return Boolean(redisUrl());
}

function getClient(): Redis | null {
  if (globalState.__bwRedisDisabled) return null;
  if (globalState.__bwRedis) return globalState.__bwRedis;

  const url = redisUrl();
  if (!url) {
    globalState.__bwRedisDisabled = true;
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    lazyConnect: true,
    // Fail-open: no reconnect loop; next call creates a fresh client after `end`.
    retryStrategy: () => null,
  });

  client.on("error", () => {
    // Fail-open: callers catch per-command errors. Avoid noisy unhandled events.
  });

  client.on("end", () => {
    if (globalState.__bwRedis === client) {
      globalState.__bwRedis = undefined;
    }
  });

  globalState.__bwRedis = client;
  return client;
}

async function withRedis<T>(fn: (client: Redis) => Promise<T>): Promise<T | null> {
  const client = getClient();
  if (!client) return null;
  try {
    if (client.status === "wait") {
      await client.connect();
    }
    return await fn(client);
  } catch {
    return null;
  }
}

export function orgTokenKey(region: string, clientId: string): string {
  return `${ORG_TOKEN_PREFIX}${region}:${clientId}`;
}

export type CachedOrgToken = {
  token: string;
  expiresAt: number;
};

export async function getCachedOrgToken(
  key: string,
): Promise<CachedOrgToken | null> {
  const raw = await withRedis((c) => c.get(key));
  if (!raw) return null;
  try {
    const json = decryptSecret(raw);
    const parsed = JSON.parse(json) as CachedOrgToken;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    // Corrupt, wrong key, or legacy plaintext — treat as miss.
    return null;
  }
}

export async function setCachedOrgToken(
  key: string,
  value: CachedOrgToken,
  ttlSeconds: number,
): Promise<void> {
  if (ttlSeconds <= 0) return;
  try {
    const enc = encryptSecret(JSON.stringify(value));
    await withRedis((c) => c.set(key, enc, "EX", ttlSeconds));
  } catch {
    // Fail-open: skip cache write if encryption/Redis fails.
  }
}

export type RedisGroupsPayload = {
  groups: Array<{
    id: string;
    name: string;
    externalId: string | null;
    syncedAt: string;
  }>;
  syncedAt: string | null;
};

export async function getCachedGroups(): Promise<RedisGroupsPayload | null> {
  const raw = await withRedis((c) => c.get(GROUPS_KEY));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RedisGroupsPayload;
    if (!Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedGroups(
  payload: RedisGroupsPayload,
): Promise<void> {
  await withRedis((c) =>
    c.set(GROUPS_KEY, JSON.stringify(payload), "EX", GROUPS_TTL_SECONDS),
  );
}
