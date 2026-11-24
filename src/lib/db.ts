import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getRedis, orgTokenKey, RedisKeys } from "@/lib/redis";

export type UserRole = "admin" | "member";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
};

export type PublicUser = Pick<UserRow, "id" | "email" | "role" | "created_at">;

export type CachedBwGroup = {
  id: string;
  name: string;
  externalId: string | null;
  syncedAt: string;
};

export type CachedOrgToken = {
  token: string;
  expiresAt: number;
};

function toPublic(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
  };
}

function parseUser(raw: string | null): UserRow | undefined {
  if (!raw) return undefined;
  try {
    const u = JSON.parse(raw) as UserRow;
    if (!u?.id || !u?.email || !u?.password_hash) return undefined;
    if (u.role !== "admin" && u.role !== "member") u.role = "member";
    return u;
  } catch {
    return undefined;
  }
}

export async function listUsers(): Promise<PublicUser[]> {
  const redis = await getRedis();
  const ids = await redis.zrange(RedisKeys.userIds, 0, -1);
  if (ids.length === 0) return [];
  const pipe = redis.pipeline();
  for (const id of ids) pipe.get(RedisKeys.user(id));
  const rows = await pipe.exec();
  const users: PublicUser[] = [];
  for (const result of rows ?? []) {
    const raw = result?.[1];
    const user = parseUser(typeof raw === "string" ? raw : null);
    if (user) users.push(toPublic(user));
  }
  return users;
}

export async function countUsers(): Promise<number> {
  const redis = await getRedis();
  return redis.zcard(RedisKeys.userIds);
}

export async function countAdmins(): Promise<number> {
  const users = await listUsers();
  return users.filter((u) => u.role === "admin").length;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const redis = await getRedis();
  return parseUser(await redis.get(RedisKeys.user(id)));
}

export async function findUserByEmail(
  email: string,
): Promise<UserRow | undefined> {
  const redis = await getRedis();
  const id = await redis.get(RedisKeys.userEmail(email));
  if (!id) return undefined;
  return findUserById(id);
}

export async function createUser(
  id: string,
  email: string,
  passwordHash: string,
  role: UserRole = "member",
): Promise<void> {
  const redis = await getRedis();
  const normalized = email.trim().toLowerCase();
  const createdAt = new Date().toISOString();
  const user: UserRow = {
    id,
    email: normalized,
    password_hash: passwordHash,
    role,
    created_at: createdAt,
  };

  const emailKey = RedisKeys.userEmail(normalized);
  const reserved = await redis.set(emailKey, id, "NX");
  if (reserved !== "OK") {
    throw new Error("Email already registered");
  }

  const score = Date.parse(createdAt) || Date.now();
  const pipe = redis.pipeline();
  pipe.set(RedisKeys.user(id), JSON.stringify(user));
  pipe.zadd(RedisKeys.userIds, score, id);
  await pipe.exec();
}

export async function deleteUser(id: string): Promise<void> {
  const redis = await getRedis();
  const user = await findUserById(id);
  if (!user) return;
  const pipe = redis.pipeline();
  pipe.del(RedisKeys.user(id));
  pipe.del(RedisKeys.userEmail(user.email));
  pipe.zrem(RedisKeys.userIds, id);
  await pipe.exec();
}

export async function updateUserPassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  const user = await findUserById(id);
  if (!user) return;
  user.password_hash = passwordHash;
  const redis = await getRedis();
  await redis.set(RedisKeys.user(id), JSON.stringify(user));
}

export async function updateUserRole(id: string, role: UserRole): Promise<void> {
  const user = await findUserById(id);
  if (!user) return;
  user.role = role;
  const redis = await getRedis();
  await redis.set(RedisKeys.user(id), JSON.stringify(user));
}

export async function getSettingsPayloadEnc(): Promise<string | null> {
  const redis = await getRedis();
  return redis.get(RedisKeys.settings);
}

export async function upsertSettingsPayloadEnc(
  payloadEnc: string,
): Promise<void> {
  const redis = await getRedis();
  await redis.set(RedisKeys.settings, payloadEnc);
}

export async function listCachedGroups(): Promise<CachedBwGroup[]> {
  const redis = await getRedis();
  const raw = await redis.get(RedisKeys.groups);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as {
      groups?: CachedBwGroup[];
    };
    if (!Array.isArray(parsed.groups)) return [];
    return [...parsed.groups].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  } catch {
    return [];
  }
}

export async function getGroupsSyncedAt(): Promise<string | null> {
  const redis = await getRedis();
  const raw = await redis.get(RedisKeys.groups);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { syncedAt?: string | null };
    return parsed.syncedAt ?? null;
  } catch {
    return null;
  }
}

export async function replaceCachedGroups(
  groups: Array<{ id: string; name: string; externalId?: string | null }>,
): Promise<CachedBwGroup[]> {
  const syncedAt = new Date().toISOString();
  const mapped: CachedBwGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    externalId: g.externalId ?? null,
    syncedAt,
  }));
  mapped.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const redis = await getRedis();
  await redis.set(
    RedisKeys.groups,
    JSON.stringify({ groups: mapped, syncedAt }),
  );
  return mapped;
}

export async function getCachedOrgToken(
  key: string,
): Promise<CachedOrgToken | null> {
  const redis = await getRedis();
  const raw = await redis.get(key);
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
    return null;
  }
}

export async function setCachedOrgToken(
  key: string,
  value: CachedOrgToken,
  ttlSeconds: number,
): Promise<void> {
  if (ttlSeconds <= 0) return;
  const redis = await getRedis();
  const enc = encryptSecret(JSON.stringify(value));
  await redis.set(key, enc, "EX", ttlSeconds);
}

export { orgTokenKey };
