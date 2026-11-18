import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import {
  BitwardenSettings,
  getRegionUrls,
} from "@/lib/settings";

const execFileAsync = promisify(execFile);

export type VaultField = {
  name: string;
  value: string;
  type: number; // 0 text, 1 hidden, 2 boolean
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
  fields: Array<{ name: string; type: number }>;
};

type SessionState = {
  sessionKey: string;
  expiresAt: number;
  homeDir: string;
};

let sessionState: SessionState | null = null;

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

async function runBw(
  args: string[],
  opts: {
    env?: Record<string, string>;
    session?: string;
    homeDir?: string;
  } = {},
): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts.env || {}),
    HOME: opts.homeDir || bwHome(),
    BW_NOINTERACTION: "1",
  };
  if (opts.session) {
    env.BW_SESSION = opts.session;
  }

  try {
    const { stdout } = await execFileAsync(bwBinary(), args, {
      env,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
      encoding: "utf8",
    });
    return stdout.trim();
  } catch (err) {
    const e = err as {
      stderr?: string;
      message?: string;
      code?: string;
    };
    if (e.code === "ENOENT") {
      throw new Error(
        "Bitwarden CLI (bw) not found. Install bw on the host/image and ensure it is on PATH.",
      );
    }
    const detail = (e.stderr || e.message || String(err)).trim();
    throw new Error(`bw ${args.join(" ")} failed: ${detail}`);
  }
}

export async function testVaultConnection(
  settings: BitwardenSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    await ensureUnlocked(settings);
    const status = await runBw(["status"], {
      session: sessionState!.sessionKey,
      homeDir: sessionState!.homeDir,
    });
    return { ok: true, message: `Vault unlocked. Status: ${status}` };
  } catch (err) {
    sessionState = null;
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function ensureUnlocked(settings: BitwardenSettings): Promise<string> {
  if (
    sessionState &&
    sessionState.expiresAt > Date.now() + 30_000
  ) {
    return sessionState.sessionKey;
  }

  const homeDir = bwHome();
  const urls = getRegionUrls(settings.region);

  await runBw(["config", "server", urls.webVault], { homeDir });

  // Logout quietly if already logged in as someone else
  try {
    await runBw(["logout"], { homeDir });
  } catch {
    // ignore
  }

  await runBw(["login", "--apikey"], {
    homeDir,
    env: {
      BW_CLIENTID: settings.vaultApiClientId,
      BW_CLIENTSECRET: settings.vaultApiClientSecret,
    },
  });

  const passwordFile = path.join(os.tmpdir(), `bw-mp-${process.pid}.txt`);
  fs.writeFileSync(passwordFile, settings.vaultMasterPassword, {
    encoding: "utf8",
    mode: 0o600,
  });

  try {
    const sessionKey = await runBw(
      ["unlock", "--passwordfile", passwordFile, "--raw"],
      { homeDir },
    );
    if (!sessionKey) {
      throw new Error("Unlock returned empty session key");
    }
    sessionState = {
      sessionKey,
      homeDir,
      expiresAt: Date.now() + 25 * 60_000,
    };
    await runBw(["sync"], {
      session: sessionKey,
      homeDir,
    });
    return sessionKey;
  } finally {
    try {
      fs.unlinkSync(passwordFile);
    } catch {
      // ignore
    }
  }
}

async function withSession<T>(
  settings: BitwardenSettings,
  fn: (session: string, homeDir: string) => Promise<T>,
): Promise<T> {
  const session = await ensureUnlocked(settings);
  return fn(session, sessionState!.homeDir);
}

export async function listItemsInCollection(
  settings: BitwardenSettings,
  collectionId: string,
): Promise<VaultItem[]> {
  return withSession(settings, async (session, homeDir) => {
    const raw = await runBw(
      ["list", "items", "--collectionid", collectionId],
      { session, homeDir },
    );
    if (!raw) return [];
    return JSON.parse(raw) as VaultItem[];
  });
}

export async function getItem(
  settings: BitwardenSettings,
  itemId: string,
): Promise<VaultItem> {
  return withSession(settings, async (session, homeDir) => {
    const raw = await runBw(["get", "item", itemId], { session, homeDir });
    return JSON.parse(raw) as VaultItem;
  });
}

export function toSafeTemplate(item: VaultItem): SafeTemplate {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    fields: (item.fields || []).map((f) => ({
      name: f.name,
      type: f.type,
    })),
  };
}

/** True clone: new item id, only target collectionIds. */
export async function cloneItemToCollection(
  settings: BitwardenSettings,
  templateId: string,
  targetCollectionId: string,
): Promise<{ id: string; name: string }> {
  return withSession(settings, async (session, homeDir) => {
    const template = JSON.parse(
      await runBw(["get", "item", templateId], { session, homeDir }),
    ) as VaultItem;

    const clone: Record<string, unknown> = {
      organizationId: settings.orgId,
      collectionIds: [targetCollectionId],
      folderId: null,
      type: template.type,
      name: template.name,
      notes: template.notes ?? null,
      favorite: false,
      fields: template.fields ?? [],
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

    const encoded = Buffer.from(JSON.stringify(clone), "utf8").toString(
      "base64",
    );
    const createdRaw = await runBw(["create", "item", encoded], {
      session,
      homeDir,
    });
    const created = JSON.parse(createdRaw) as VaultItem;
    return { id: created.id, name: created.name };
  });
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
  return withSession(settings, async (session, homeDir) => {
    const type = input.type ?? 2;
    const item: Record<string, unknown> = {
      organizationId: settings.orgId,
      collectionIds: [templatesCollectionId],
      folderId: null,
      type,
      name: input.name,
      notes: input.notes ?? null,
      favorite: false,
      fields: input.fields ?? [],
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

    const encoded = Buffer.from(JSON.stringify(item), "utf8").toString(
      "base64",
    );
    const raw = await runBw(["create", "item", encoded], {
      session,
      homeDir,
    });
    return JSON.parse(raw) as VaultItem;
  });
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
  return withSession(settings, async (session, homeDir) => {
    const existing = JSON.parse(
      await runBw(["get", "item", itemId], { session, homeDir }),
    ) as VaultItem;

    if (input.name !== undefined) existing.name = input.name;
    if (input.notes !== undefined) existing.notes = input.notes;
    if (input.fields !== undefined) existing.fields = input.fields;

    const encoded = Buffer.from(JSON.stringify(existing), "utf8").toString(
      "base64",
    );
    const raw = await runBw(["edit", "item", itemId, encoded], {
      session,
      homeDir,
    });
    return JSON.parse(raw) as VaultItem;
  });
}

export async function deleteTemplateItem(
  settings: BitwardenSettings,
  itemId: string,
): Promise<void> {
  await withSession(settings, async (session, homeDir) => {
    await runBw(["delete", "item", itemId], { session, homeDir });
  });
}
