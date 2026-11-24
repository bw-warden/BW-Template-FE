import fs from "fs";
import path from "path";
import { countUsers, createUser, upsertSettingsPayloadEnc, replaceCachedGroups } from "@/lib/db";
import { getRedis, RedisKeys } from "@/lib/redis";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

/**
 * One-shot import from a legacy app.db into Redis. Safe to call every boot:
 * skips if Redis already has users or the migrate flag is set.
 */
export async function migrateSqliteIfNeeded(): Promise<void> {
  if (!fs.existsSync(DB_PATH)) return;

  const redis = await getRedis();
  if (await redis.get(RedisKeys.migratedFlag)) return;
  if ((await countUsers()) > 0) {
    await redis.set(RedisKeys.migratedFlag, new Date().toISOString());
    return;
  }

  let Database: typeof import("better-sqlite3");
  try {
    Database = (await import("better-sqlite3")).default;
  } catch {
    console.warn(
      "[migrate] app.db present but better-sqlite3 is unavailable; skipping import",
    );
    return;
  }

  console.log("[migrate] Importing legacy app.db into Redis…");
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const users = db
      .prepare(
        "SELECT id, email, password_hash, role, created_at FROM users ORDER BY created_at ASC",
      )
      .all() as Array<{
      id: string;
      email: string;
      password_hash: string;
      role: string;
      created_at: string;
    }>;

    for (const u of users) {
      const role = u.role === "admin" ? "admin" : "member";
      try {
        await createUser(u.id, u.email, u.password_hash, role);
        // Preserve original created_at score
        const score = Date.parse(u.created_at) || Date.now();
        await redis.zadd(RedisKeys.userIds, score, u.id);
        const stored = await redis.get(RedisKeys.user(u.id));
        if (stored) {
          const parsed = JSON.parse(stored) as { created_at?: string };
          parsed.created_at = u.created_at;
          await redis.set(RedisKeys.user(u.id), JSON.stringify(parsed));
        }
      } catch (err) {
        console.warn("[migrate] user skip:", u.email, err);
      }
    }

    const settings = db
      .prepare("SELECT payload_enc FROM settings WHERE id = 1")
      .get() as { payload_enc: string } | undefined;
    if (settings?.payload_enc) {
      await upsertSettingsPayloadEnc(settings.payload_enc);
    }

    const groups = db
      .prepare(
        "SELECT id, name, external_id, synced_at FROM bw_groups ORDER BY name ASC",
      )
      .all() as Array<{
      id: string;
      name: string;
      external_id: string | null;
      synced_at: string;
    }>;
    if (groups.length > 0) {
      await replaceCachedGroups(
        groups.map((g) => ({
          id: g.id,
          name: g.name,
          externalId: g.external_id,
        })),
      );
    }

    await redis.set(RedisKeys.migratedFlag, new Date().toISOString());
    const bak = `${DB_PATH}.migrated`;
    try {
      fs.renameSync(DB_PATH, bak);
      for (const side of [`${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
        if (fs.existsSync(side)) fs.renameSync(side, `${side}.migrated`);
      }
    } catch {
      console.warn("[migrate] Could not rename app.db; leave in place");
    }
    console.log(
      `[migrate] Done — imported ${users.length} user(s), settings=${Boolean(settings)}, groups=${groups.length}`,
    );
  } finally {
    db.close();
  }
}
