import Redis from "ioredis";

const CONNECT_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 5_000;

type GlobalRedis = {
  __bwRedis?: Redis | null;
};

const globalState = globalThis as typeof globalThis & GlobalRedis;

function redisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error(
      "REDIS_URL is required — Redis is the primary application store",
    );
  }
  return url;
}

/** Shared Redis client. Throws if REDIS_URL is unset or the connection fails. */
export async function getRedis(): Promise<Redis> {
  if (globalState.__bwRedis && globalState.__bwRedis.status === "ready") {
    return globalState.__bwRedis;
  }

  if (globalState.__bwRedis) {
    try {
      globalState.__bwRedis.disconnect(false);
    } catch {
      // ignore
    }
    globalState.__bwRedis = undefined;
  }

  const client = new Redis(redisUrl(), {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 8) return null;
      return Math.min(times * 200, 2_000);
    },
  });

  client.on("error", (err) => {
    console.error("[redis]", err.message);
  });

  client.on("end", () => {
    if (globalState.__bwRedis === client) {
      globalState.__bwRedis = undefined;
    }
  });

  if (client.status === "wait") {
    await client.connect();
  }

  globalState.__bwRedis = client;
  return client;
}

export function orgTokenKey(region: string, clientId: string): string {
  return `bw:org-token-v2:${region}:${clientId}`;
}

/** Key layout for durable app data (no TTL unless noted). */
export const RedisKeys = {
  user: (id: string) => `bw:user:${id}`,
  userEmail: (email: string) => `bw:user:email:${email.trim().toLowerCase()}`,
  userIds: "bw:user:ids",
  settings: "bw:settings",
  groups: "bw:groups",
  migratedFlag: "bw:meta:sqlite-migrated",
} as const;
