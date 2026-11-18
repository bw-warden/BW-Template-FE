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
  `);

  dbInstance = db;
  return db;
}

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
};

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
): void {
  getDb()
    .prepare(
      "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
    )
    .run(id, email.trim().toLowerCase(), passwordHash);
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
