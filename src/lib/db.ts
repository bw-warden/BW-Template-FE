import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload_enc TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bw_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      external_id TEXT,
      synced_at TEXT NOT NULL
    );
  `);

  const columns = db.prepare("PRAGMA table_info(users)").all() as Array<{
    name: string;
  }>;
  if (!columns.some((c) => c.name === "role")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'",
    );
  }
  // Databases created before roles existed: the setup account is the admin.
  const admins = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")
    .get() as { c: number };
  if (admins.c === 0) {
    db.exec(
      `UPDATE users SET role = 'admin'
       WHERE id = (SELECT id FROM users ORDER BY created_at ASC, rowid ASC LIMIT 1)`,
    );
  }

  dbInstance = db;
  return db;
}

export type UserRole = "admin" | "member";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
};

export type PublicUser = Pick<UserRow, "id" | "email" | "role" | "created_at">;

export function listUsers(): PublicUser[] {
  return getDb()
    .prepare(
      "SELECT id, email, role, created_at FROM users ORDER BY created_at ASC, rowid ASC",
    )
    .all() as PublicUser[];
}

export function countAdmins(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")
    .get() as { c: number };
  return row.c;
}

export function deleteUser(id: string): void {
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function updateUserPassword(id: string, passwordHash: string): void {
  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, id);
}

export function updateUserRole(id: string, role: UserRole): void {
  getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as {
    c: number;
  };
  return row.c;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(email.trim()) as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
}

export function createUser(
  id: string,
  email: string,
  passwordHash: string,
  role: UserRole = "member",
): void {
  getDb()
    .prepare(
      "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)",
    )
    .run(id, email.trim().toLowerCase(), passwordHash, role);
}

export function getSettingsPayloadEnc(): string | null {
  const row = getDb()
    .prepare("SELECT payload_enc FROM settings WHERE id = 1")
    .get() as { payload_enc: string } | undefined;
  return row?.payload_enc ?? null;
}

export function upsertSettingsPayloadEnc(payloadEnc: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (id, payload_enc, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         payload_enc = excluded.payload_enc,
         updated_at = datetime('now')`,
    )
    .run(payloadEnc);
}

export type CachedBwGroup = {
  id: string;
  name: string;
  externalId: string | null;
  syncedAt: string;
};

export function listCachedGroups(): CachedBwGroup[] {
  const rows = getDb()
    .prepare(
      "SELECT id, name, external_id, synced_at FROM bw_groups ORDER BY name COLLATE NOCASE ASC",
    )
    .all() as Array<{
    id: string;
    name: string;
    external_id: string | null;
    synced_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    externalId: r.external_id,
    syncedAt: r.synced_at,
  }));
}

export function getGroupsSyncedAt(): string | null {
  const row = getDb()
    .prepare("SELECT synced_at FROM bw_groups ORDER BY synced_at DESC LIMIT 1")
    .get() as { synced_at: string } | undefined;
  return row?.synced_at ?? null;
}

export function replaceCachedGroups(
  groups: Array<{ id: string; name: string; externalId?: string | null }>,
): CachedBwGroup[] {
  const db = getDb();
  const syncedAt = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM bw_groups").run();
    const insert = db.prepare(
      "INSERT INTO bw_groups (id, name, external_id, synced_at) VALUES (?, ?, ?, ?)",
    );
    for (const g of groups) {
      insert.run(g.id, g.name, g.externalId ?? null, syncedAt);
    }
  });
  tx();
  return listCachedGroups();
}
