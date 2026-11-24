import { ChildProcess, execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  BitwardenSettings,
  getRegionUrls,
} from "@/lib/settings";
import {
  decodeTemplateFields,
  encodeTemplateFields,
  missingRequiredFields,
  RequiredFieldsError,
  stripTemplateMeta,
} from "@/lib/template-fields";

export { RequiredFieldsError };

const execFileAsync = promisify(execFile);

const SERVE_HOST = "127.0.0.1";
const SERVE_PORT = Number(process.env.BW_SERVE_PORT || 8087);
const SERVE_READY_TIMEOUT_MS = 60_000;
const SYNC_MAX_AGE_MS = 60_000;

export type VaultField = {
  name: string;
  value: string;
  type: number; // 0 text, 1 hidden, 2 boolean
  /** Set on template writes. Stripped before the field is stored in Bitwarden. */
  required?: boolean;
};

export type VaultItem = {
  id: string;
  name: string;
  type: number;
  notes?: string;
  favorite?: boolean;
  fields?: VaultField[];
  login?: {
    uris?: Array<{ uri: string; match?: number | null }>;
    username?: string;
    password?: string;
    totp?: string;
  };
  card?: Record<string, unknown>;
  identity?: Record<string, unknown>;
  secureNote?: { type: number };
  collectionIds?: string[];
  organizationId?: string;
  folderId?: string | null;
  reprompt?: number;
};

export type SafeTemplate = {
  id: string;
  name: string;
  type: number;
  fields: Array<{ name: string; type: number; required: boolean }>;
};

export type OrgCollection = {
  id: string;
  name: string;
  externalId?: string | null;
  organizationId?: string;
};

type SessionState = {
  sessionKey: string;
  lastSyncAt: number;
  serve: ChildProcess;
};

// Route bundles can load this module more than once; keep one `bw serve` per process.
const globalState = globalThis as typeof globalThis & {
  __bwSession?: SessionState | null;
  __bwUnlocking?: Promise<SessionState> | null;
  __bwQueue?: Promise<unknown>;
};

function getSession(): SessionState | null {
  const s = globalState.__bwSession ?? null;
  return s && s.serve.exitCode === null && !s.serve.killed ? s : null;
}

function bwBinary(): string {
  return process.env.BW_CLI_PATH || "bw";
}

function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function bwHome(): string {
  const home = path.join(dataDir(), "bw-home");
  fs.mkdirSync(home, { recursive: true });
  return home;
}

/**
 * Minimal env for `bw` children — never pass APP_SECRET, REDIS_URL, or the
 * rest of process.env (those would be readable via /proc/*/environ).
 */
function bwEnv(
  homeDir: string,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const allow = [
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
    "TZ",
  ] as const;
  const env: NodeJS.ProcessEnv = {
    HOME: homeDir,
    BW_NOINTERACTION: "1",
  };
  for (const key of allow) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(extra)) {
    env[key] = value;
  }
  return env;
}

/** One-shot CLI process. Only used for login/unlock; everything else goes through `bw serve`. */
async function runBw(
  args: string[],
  opts: { env?: Record<string, string>; homeDir?: string } = {},
): Promise<string> {
  const started = Date.now();
  try {
    const { stdout } = await execFileAsync(bwBinary(), args, {
      env: bwEnv(opts.homeDir || bwHome(), opts.env),
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
      encoding: "utf8",
    });
    console.log(`[bw] ${args[0]} ${Date.now() - started}ms`);
    return stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string; message?: string; code?: string };
    if (e.code === "ENOENT") {
      throw new Error(
        "Bitwarden CLI (bw) not found. Install bw on the host/image and ensure it is on PATH.",
      );
    }
    const detail = (e.stderr || e.message || String(err)).trim();
    // Log stderr server-side only — never put CLI output in thrown messages
    // that may reach API clients (can contain paths or credential hints).
    console.error(`[bw] ${args[0]} failed: ${detail.slice(0, 500)}`);
    throw new Error(`Bitwarden CLI ${args[0]} failed`);
  }
}

function stopServe(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(done);
      resolve();
    });
    child.kill();
  });
}

async function startServe(sessionKey: string, homeDir: string): Promise<ChildProcess> {
  const child = spawn(
    bwBinary(),
    ["serve", "--hostname", SERVE_HOST, "--port", String(SERVE_PORT)],
    { env: bwEnv(homeDir, { BW_SESSION: sessionKey }), stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-2000);
  });
  child.on("exit", (code) => {
    console.log(`[bw] serve exited (${code})`);
    if (globalState.__bwSession?.serve === child) globalState.__bwSession = null;
  });

  const started = Date.now();
  while (Date.now() - started < SERVE_READY_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      console.error(
        `[bw] serve exited during startup: ${(stderr || String(child.exitCode)).slice(0, 500)}`,
      );
      throw new Error("Bitwarden vault service failed to start");
    }
    try {
      const res = await fetch(`http://${SERVE_HOST}:${SERVE_PORT}/status`);
      if (res.ok) {
        console.log(`[bw] serve ready ${Date.now() - started}ms`);
        return child;
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error("bw serve did not start in time");
}

/** Concurrent callers share one unlock; parallel logout/login would clobber each other. */
function ensureUnlocked(settings: BitwardenSettings): Promise<SessionState> {
  const current = getSession();
  if (current) return Promise.resolve(current);
  if (!globalState.__bwUnlocking) {
    globalState.__bwUnlocking = unlockVault(settings).finally(() => {
      globalState.__bwUnlocking = null;
    });
  }
  return globalState.__bwUnlocking;
}

async function unlockVault(settings: BitwardenSettings): Promise<SessionState> {
  const homeDir = bwHome();
  const urls = getRegionUrls(settings.region);

  // The CLI state file is shared, so the old server must be gone before logout.
  await stopServe(globalState.__bwSession?.serve);
  globalState.__bwSession = null;

  // A logged-in CLI refuses `config server` until logout. The session on disk
  // survives process restarts, so logout has to happen first.
  try {
    await runBw(["logout"], { homeDir });
  } catch {
    // ignore if already logged out
  }

  await runBw(["config", "server", urls.webVault], { homeDir });

  await runBw(["login", "--apikey"], {
    homeDir,
    env: {
      BW_CLIENTID: settings.vaultApiClientId,
      BW_CLIENTSECRET: settings.vaultApiClientSecret,
    },
  });

  // Keep the master-password file under DATA_DIR (not OS temp), random name,
  // mode 0600, and delete immediately after unlock.
  const mpDir = fs.mkdtempSync(path.join(homeDir, ".mp-"));
  const passwordFile = path.join(mpDir, "pw");
  fs.writeFileSync(passwordFile, settings.vaultMasterPassword, {
    encoding: "utf8",
    mode: 0o600,
  });

  let sessionKey: string;
  try {
    sessionKey = await runBw(["unlock", "--passwordfile", passwordFile, "--raw"], {
      homeDir,
    });
  } finally {
    try {
      fs.rmSync(mpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  if (!sessionKey) throw new Error("Unlock returned empty session key");

  const serve = await startServe(sessionKey, homeDir);
  const state: SessionState = { sessionKey, lastSyncAt: 0, serve };
  globalState.__bwSession = state;
  await serveRequest("POST", "/sync");
  state.lastSyncAt = Date.now();
  return state;
}

type ServeResponse<T> = { success: boolean; message?: string; data?: T };

/** `bw serve` shares one local state; run its requests one at a time. */
function serveRequest<T = unknown>(method: string, pathname: string, body?: unknown): Promise<T> {
  const run = async () => {
    const started = Date.now();
    const res = await fetch(`http://${SERVE_HOST}:${SERVE_PORT}${pathname}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as ServeResponse<T>;
    console.log(`[bw] ${method} ${pathname.split("?")[0]} ${Date.now() - started}ms`);
    if (!res.ok || !payload.success) {
      const detail = payload.message || `status ${res.status}`;
      console.error(`[bw] ${method} ${pathname.split("?")[0]} failed: ${detail}`);
      // Keep a short stable message for session-retry detection; no upstream body.
      const sessionHint = /locked|not logged in|unauthenticated/i.test(detail)
        ? "locked"
        : "failed";
      throw new Error(`Bitwarden vault request ${sessionHint}`);
    }
    return payload.data as T;
  };
  const queued = (globalState.__bwQueue ?? Promise.resolve()).then(run, run);
  globalState.__bwQueue = queued.catch(() => {});
  return queued;
}

function isSessionError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err);
  return /locked|not logged in|unauthenticated|ECONNREFUSED|fetch failed/i.test(msg);
}

/** Call the vault, re-unlocking once if `bw serve` died or lost its session. */
async function vault<T = unknown>(
  settings: BitwardenSettings,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<T> {
  await ensureUnlocked(settings);
  try {
    return await serveRequest<T>(method, pathname, body);
  } catch (err) {
    if (!isSessionError(err)) throw err;
    await stopServe(globalState.__bwSession?.serve);
    globalState.__bwSession = null;
    await ensureUnlocked(settings);
    return serveRequest<T>(method, pathname, body);
  }
}

function listData<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as { data?: T[] } | undefined)?.data;
  return Array.isArray(inner) ? inner : [];
}

export async function testVaultConnection(
  settings: BitwardenSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await vault<{ template?: { status?: string; serverUrl?: string } }>(
      settings,
      "GET",
      "/status",
    );
    const status = data?.template?.status ?? "unknown";
    return { ok: true, message: `Vault unlocked (${status})` };
  } catch (err) {
    console.error(
      "[bw] vault connection test failed:",
      err instanceof Error ? err.message : err,
    );
    await stopServe(globalState.__bwSession?.serve);
    globalState.__bwSession = null;
    return {
      ok: false,
      message: "Vault connection failed",
    };
  }
}

async function syncVault(settings: BitwardenSettings): Promise<void> {
  await vault(settings, "POST", "/sync");
  const s = getSession();
  if (s) s.lastSyncAt = Date.now();
}

async function syncIfStale(settings: BitwardenSettings): Promise<void> {
  const s = await ensureUnlocked(settings);
  if (s.lastSyncAt > 0 && Date.now() - s.lastSyncAt < SYNC_MAX_AGE_MS) return;
  await syncVault(settings);
}

/** Pull the latest vault state, e.g. items another user just added. */
export async function syncNow(settings: BitwardenSettings): Promise<void> {
  await syncVault(settings);
}

export async function listItemsInCollection(
  settings: BitwardenSettings,
  collectionId: string,
): Promise<VaultItem[]> {
  const data = await vault(
    settings,
    "GET",
    `/list/object/items?collectionid=${encodeURIComponent(collectionId)}`,
  );
  return listData<VaultItem>(data);
}

export async function getItem(
  settings: BitwardenSettings,
  itemId: string,
): Promise<VaultItem> {
  return vault<VaultItem>(settings, "GET", `/object/item/${encodeURIComponent(itemId)}`);
}

async function createItem(
  settings: BitwardenSettings,
  item: Record<string, unknown>,
): Promise<VaultItem> {
  return vault<VaultItem>(settings, "POST", "/object/item", item);
}

export function toSafeTemplate(item: VaultItem): SafeTemplate {
  const { fields, requiredNames } = decodeTemplateFields(item.fields);
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    fields: fields.map((f) => ({
      name: f.name,
      type: f.type,
      required: requiredNames.has(f.name),
    })),
  };
}

export type TemplateForm = {
  id: string;
  name: string;
  type: number;
  notes: string;
  login: { username: string; uris: string[]; hasTotp: boolean } | null;
  fields: Array<VaultField & { required: boolean }>;
};

/** Defaults for the new-item form. Hidden field values and passwords are never sent. */
export function toTemplateForm(item: VaultItem): TemplateForm {
  const { fields, requiredNames } = decodeTemplateFields(item.fields);
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    notes: item.notes ?? "",
    login:
      item.type === 1
        ? {
            username: item.login?.username ?? "",
            uris: (item.login?.uris ?? []).map((u) => u.uri).filter(Boolean),
            hasTotp: Boolean(item.login?.totp),
          }
        : null,
    fields: fields.map((f) => ({
      name: f.name,
      type: f.type,
      value: f.type === 1 ? "" : f.value,
      required: requiredNames.has(f.name),
    })),
  };
}

export type NewItemInput = {
  name: string;
  notes?: string;
  login?: {
    username?: string;
    password?: string;
    totp?: string;
    uris?: string[];
  };
  fields?: VaultField[];
};

/**
 * Create one new item shaped by a template, with values entered by the user.
 * The template must live in the Templates collection.
 */
export async function createItemFromTemplate(
  settings: BitwardenSettings,
  templatesCollectionId: string,
  templateId: string,
  targetCollectionId: string,
  input: NewItemInput,
): Promise<{ id: string; name: string }> {
  const template = await getItem(settings, templateId);
  if (!(template.collectionIds ?? []).includes(templatesCollectionId)) {
    throw new Error("That item is not a template");
  }

  const missing = missingRequiredFields(template.fields, input.fields);
  if (missing.length) throw new RequiredFieldsError(missing);

  const item: Record<string, unknown> = {
    organizationId: settings.orgId,
    collectionIds: [targetCollectionId],
    folderId: null,
    type: template.type,
    name: input.name.trim() || template.name,
    notes: input.notes ?? null,
    favorite: false,
    fields: stripTemplateMeta(input.fields)
      .filter((f) => f.name.trim())
      .map((f) => ({ name: f.name.trim(), value: f.value ?? "", type: f.type ?? 0 })),
    reprompt: template.reprompt ?? 0,
  };

  if (template.type === 1) {
    item.login = {
      uris: (input.login?.uris ?? [])
        .map((u) => u.trim())
        .filter(Boolean)
        .map((uri) => ({ uri, match: null })),
      username: input.login?.username || null,
      password: input.login?.password || null,
      totp: input.login?.totp || null,
    };
  } else if (template.type === 3 && template.card) {
    item.card = template.card;
  } else if (template.type === 4 && template.identity) {
    item.identity = template.identity;
  } else {
    item.type = 2;
    item.secureNote = { type: 0 };
  }

  const created = await createItem(settings, item);
  return { id: created.id, name: created.name };
}

export async function countItemsInCollection(
  settings: BitwardenSettings,
  collectionId: string,
): Promise<number> {
  const items = await listItemsInCollection(settings, collectionId);
  return items.filter((i) => (i.collectionIds ?? []).includes(collectionId)).length;
}

/** True clone: new item id, only target collectionIds. */
export async function cloneItemToCollection(
  settings: BitwardenSettings,
  templateId: string,
  targetCollectionId: string,
): Promise<{ id: string; name: string }> {
  const template = await getItem(settings, templateId);

  const clone: Record<string, unknown> = {
    organizationId: settings.orgId,
    collectionIds: [targetCollectionId],
    folderId: null,
    type: template.type,
    name: template.name,
    notes: template.notes ?? null,
    favorite: false,
    fields: stripTemplateMeta(template.fields),
    reprompt: template.reprompt ?? 0,
  };

  if (template.type === 1 && template.login) {
    clone.login = {
      uris: template.login.uris ?? [],
      username: template.login.username ?? null,
      password: template.login.password ?? null,
      totp: template.login.totp ?? null,
    };
  } else if (template.type === 2) {
    clone.secureNote = template.secureNote ?? { type: 0 };
  } else if (template.type === 3 && template.card) {
    clone.card = template.card;
  } else if (template.type === 4 && template.identity) {
    clone.identity = template.identity;
  } else {
    clone.secureNote = { type: 0 };
    clone.type = 2;
  }

  const created = await createItem(settings, clone);
  return { id: created.id, name: created.name };
}

export async function createTemplateItem(
  settings: BitwardenSettings,
  templatesCollectionId: string,
  input: {
    name: string;
    type?: number;
    notes?: string;
    fields?: VaultField[];
    login?: VaultItem["login"];
  },
): Promise<VaultItem> {
  const type = input.type ?? 2;
  const item: Record<string, unknown> = {
    organizationId: settings.orgId,
    collectionIds: [templatesCollectionId],
    folderId: null,
    type,
    name: input.name,
    notes: input.notes ?? null,
    favorite: false,
    fields: encodeTemplateFields(input.fields ?? []),
    reprompt: 0,
  };
  if (type === 1) {
    item.login = input.login ?? {
      uris: [],
      username: null,
      password: null,
      totp: null,
    };
  } else {
    item.type = 2;
    item.secureNote = { type: 0 };
  }
  return createItem(settings, item);
}

export async function updateTemplateItem(
  settings: BitwardenSettings,
  itemId: string,
  input: {
    name?: string;
    notes?: string;
    fields?: VaultField[];
  },
): Promise<VaultItem> {
  const existing = await getItem(settings, itemId);
  if (input.name !== undefined) existing.name = input.name;
  if (input.notes !== undefined) existing.notes = input.notes;
  if (input.fields !== undefined) {
    const previous = decodeTemplateFields(existing.fields).fields;
    const merged = input.fields.map((field) => {
      if (field.type !== 1 || field.value) return field;
      const prior = previous.find((item) => item.name === field.name && item.type === 1);
      return prior ? { ...field, value: prior.value } : field;
    });
    existing.fields = encodeTemplateFields(merged);
  }
  return vault<VaultItem>(
    settings,
    "PUT",
    `/object/item/${encodeURIComponent(itemId)}`,
    existing,
  );
}

export async function deleteTemplateItem(
  settings: BitwardenSettings,
  itemId: string,
): Promise<void> {
  await vault(settings, "DELETE", `/object/item/${encodeURIComponent(itemId)}`);
}

function parseCollections(data: unknown): OrgCollection[] {
  return listData<OrgCollection>(data).filter((row) => row?.id && row.name);
}

async function fetchOrgCollections(settings: BitwardenSettings): Promise<OrgCollection[]> {
  const data = await vault(
    settings,
    "GET",
    `/list/object/org-collections?organizationid=${encodeURIComponent(settings.orgId)}`,
  );
  return parseCollections(data);
}

/** Decrypted org collection names. The public API no longer returns names. */
export async function listOrgCollections(
  settings: BitwardenSettings,
  opts: { fresh?: boolean } = {},
): Promise<OrgCollection[]> {
  if (!settings.orgId) throw new Error("Organization ID is required");
  if (opts.fresh) await syncVault(settings);
  else await syncIfStale(settings);
  return fetchOrgCollections(settings);
}

/**
 * Create a collection through the CLI. The public API has no POST;
 * names are encrypted with the organization key.
 */
export async function createOrgCollection(
  settings: BitwardenSettings,
  name: string,
  groups: Array<{
    id: string;
    readOnly: boolean;
    hidePasswords: boolean;
    manage: boolean;
  }> = [],
): Promise<OrgCollection> {
  if (!settings.orgId) throw new Error("Organization ID is required");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Shared Folder name is required");

  // Omit `users` so the CLI grants this service account Can manage.
  // An explicit empty array would leave the collection with no manager.
  const body = {
    organizationId: settings.orgId,
    name: trimmed,
    externalId: null,
    groups,
  };
  const created = await vault<OrgCollection | null>(
    settings,
    "POST",
    `/object/org-collection?organizationid=${encodeURIComponent(settings.orgId)}`,
    body,
  );

  if (created?.id) {
    // Force the next list to pull the new collection from the server.
    const s = getSession();
    if (s) s.lastSyncAt = 0;
    return { ...created, name: created.name || trimmed };
  }

  await syncVault(settings);
  const found = (await fetchOrgCollections(settings)).find(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (!found) {
    throw new Error(`Created Shared Folder "${trimmed}" but the CLI did not return its id`);
  }
  return found;
}
