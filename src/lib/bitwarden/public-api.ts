import {
  createOrgCollection,
  listOrgCollections,
} from "@/lib/bitwarden/vault";
import {
  CollectionAccessGrant,
  toBwGroupAccess,
} from "@/lib/collection-access";
import {
  getCachedOrgToken,
  orgTokenKey,
  setCachedOrgToken,
} from "@/lib/db";
import {
  BitwardenSettings,
  getRegionUrls,
} from "@/lib/settings";

export type BwCollection = {
  id: string;
  name: string;
  externalId?: string | null;
  groups?: Array<{
    id: string;
    readOnly: boolean;
    hidePasswords: boolean;
    manage: boolean;
  }>;
};

export type BwGroup = {
  id: string;
  name: string;
  externalId?: string | null;
};

type TokenCache = { token: string; expiresAt: number };
/** Process-local L1 cache — hot path avoids a Redis round-trip. */
const tokenCache = new Map<string, TokenCache>();

function tokenStillValid(cached: TokenCache): boolean {
  return cached.expiresAt > Date.now() + 60_000;
}

async function getOrgToken(settings: BitwardenSettings): Promise<string> {
  const cacheKey = `${settings.region}:${settings.orgApiClientId}`;
  const redisKey = orgTokenKey(settings.region, settings.orgApiClientId);

  const l1 = tokenCache.get(cacheKey);
  if (l1 && tokenStillValid(l1)) {
    return l1.token;
  }

  const fromRedis = await getCachedOrgToken(redisKey);
  if (fromRedis && tokenStillValid(fromRedis)) {
    tokenCache.set(cacheKey, fromRedis);
    return fromRedis.token;
  }

  const urls = getRegionUrls(settings.region);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "api.organization",
    client_id: settings.orgApiClientId,
    client_secret: settings.orgApiClientSecret,
  });

  const res = await fetch(`${urls.identity}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[org-api] token failed (${res.status}): ${text.slice(0, 300)}`,
    );
    throw new Error("Organization API authentication failed");
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  const entry: TokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  tokenCache.set(cacheKey, entry);

  // TTL matches usable lifetime (minus the same 60s skew used for reads).
  const ttlSeconds = Math.max(
    1,
    Math.floor((entry.expiresAt - Date.now() - 60_000) / 1000),
  );
  void setCachedOrgToken(redisKey, entry, ttlSeconds);

  return entry.token;
}

async function apiFetch<T>(
  settings: BitwardenSettings,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getOrgToken(settings);
  const urls = getRegionUrls(settings.region);
  const res = await fetch(`${urls.api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = (await res.text()).trim();
    console.error(
      `[org-api] ${path} failed (${res.status}): ${text.slice(0, 300)}`,
    );
    throw new Error("Bitwarden organization API request failed");
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type CollectionListResponse = {
  data?: BwCollection[];
  continuationToken?: string | null;
};

/**
 * Public API list. Collection names are encrypted and are not in this payload.
 * Includes group access arrays used for the Clients admin tab.
 */
export async function listPublicCollections(
  settings: BitwardenSettings,
): Promise<BwCollection[]> {
  const all: BwCollection[] = [];
  const seen = new Set<string>();
  let token: string | null | undefined;

  do {
    const path = token
      ? `/public/collections?continuationToken=${encodeURIComponent(token)}`
      : "/public/collections";
    const data = await apiFetch<CollectionListResponse | BwCollection[]>(
      settings,
      path,
    );
    if (Array.isArray(data)) return data;
    all.push(...(data.data ?? []));
    const next = data.continuationToken || null;
    if (!next || seen.has(next) || seen.size >= 40) break;
    seen.add(next);
    token = next;
  } while (token);

  return all;
}

type GroupListResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    externalId?: string | null;
  }>;
  continuationToken?: string | null;
};

/** Organization groups via Public API (names are plaintext). */
export async function listGroups(
  settings: BitwardenSettings,
): Promise<BwGroup[]> {
  const all: BwGroup[] = [];
  const seen = new Set<string>();
  let token: string | null | undefined;

  do {
    const path = token
      ? `/public/groups?continuationToken=${encodeURIComponent(token)}`
      : "/public/groups";
    const data = await apiFetch<GroupListResponse | BwGroup[]>(settings, path);
    if (Array.isArray(data)) {
      return data
        .filter((g) => g?.id && g.name)
        .map((g) => ({
          id: g.id,
          name: g.name,
          externalId: g.externalId ?? null,
        }));
    }
    for (const g of data.data ?? []) {
      if (!g?.id || !g.name) continue;
      all.push({
        id: g.id,
        name: g.name,
        externalId: g.externalId ?? null,
      });
    }
    const next = data.continuationToken || null;
    if (!next || seen.has(next) || seen.size >= 40) break;
    seen.add(next);
    token = next;
  } while (token);

  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function testOrgConnection(
  settings: BitwardenSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    const collections = await listPublicCollections(settings);
    return {
      ok: true,
      message: `Organization API OK (${collections.length} Shared Folders)`,
    };
  } catch (err) {
    console.error(
      "[org-api] connection test failed:",
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      message: "Organization API connection failed",
    };
  }
}

/** Named collections via the unlocked service account. Public API omits names. */
export async function listCollections(
  settings: BitwardenSettings,
  opts: { fresh?: boolean } = {},
): Promise<BwCollection[]> {
  const rows = await listOrgCollections(settings, opts);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    externalId: row.externalId ?? null,
  }));
}

export async function createCollection(
  settings: BitwardenSettings,
  name: string,
  groups: BwCollection["groups"] = [],
): Promise<BwCollection> {
  const access = groups ?? [];
  const created = await createOrgCollection(settings, name, access);
  if (access.length) {
    await updateCollectionAccess(settings, created.id, name, access);
  }
  return {
    id: created.id,
    name: created.name || name,
    externalId: created.externalId ?? null,
    groups: access,
  };
}

export async function updateCollectionAccess(
  settings: BitwardenSettings,
  collectionId: string,
  name: string,
  groups: NonNullable<BwCollection["groups"]>,
): Promise<void> {
  await apiFetch(settings, `/public/collections/${collectionId}`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      externalId: null,
      groups,
    }),
  });
}

/** Find collection by exact full path name (e.g. Clients/Acme/Software). */
export function findCollectionByName(
  collections: BwCollection[],
  name: string,
): BwCollection | undefined {
  const norm = name.trim().toLowerCase();
  return collections.find((c) => c.name.trim().toLowerCase() === norm);
}

export async function ensureRootCollection(
  settings: BitwardenSettings,
  rootName: string,
): Promise<BwCollection> {
  const collections = await listCollections(settings);
  const existing = findCollectionByName(collections, rootName);
  if (existing) return existing;
  return createCollection(settings, rootName, []);
}

export type ClientNode = {
  id: string;
  name: string;
  path: string;
  softwareId: string | null;
  hardwareId: string | null;
};

/** Client folders are direct children of Clients root: Clients/{Name}. */
export function listClientNodes(
  collections: BwCollection[],
  clientsRoot: string,
): ClientNode[] {
  const root = clientsRoot.trim();
  const prefix = `${root}/`;
  const byName = new Map(collections.map((c) => [c.name, c]));

  const clients = collections.filter((c) => {
    if (!c.name.startsWith(prefix)) return false;
    const rest = c.name.slice(prefix.length);
    return rest.length > 0 && !rest.includes("/");
  });

  return clients
    .map((c) => {
      const name = c.name.slice(prefix.length);
      const software = byName.get(`${c.name}/Software`);
      const hardware = byName.get(`${c.name}/Hardware`);
      return {
        id: c.id,
        name,
        path: c.name,
        softwareId: software?.id ?? null,
        hardwareId: hardware?.id ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function findClientNode(
  settings: BitwardenSettings,
  clientId: string,
): Promise<ClientNode | null> {
  const collections = await listCollections(settings);
  const clients = listClientNodes(collections, settings.clientsRootName || "Clients");
  return clients.find((c) => c.id === clientId) ?? null;
}

let provisionQueue: Promise<unknown> = Promise.resolve();

/**
 * One provision at a time. Concurrent requests for the same client would each
 * see a list missing the other's new collections and create duplicates.
 */
export function provisionClient(
  settings: BitwardenSettings,
  clientName: string,
): Promise<ClientNode> {
  const run = provisionQueue.then(() => provisionClientNow(settings, clientName));
  provisionQueue = run.catch(() => undefined);
  return run;
}

async function provisionClientNow(
  settings: BitwardenSettings,
  clientName: string,
): Promise<ClientNode> {
  const name = clientName.trim();
  if (!name) throw new Error("Client name is required");
  if (name.includes("/")) {
    throw new Error("Client name cannot contain '/'");
  }

  const root = settings.clientsRootName || "Clients";
  const collections = await listCollections(settings, { fresh: true });
  if (!findCollectionByName(collections, root)) {
    await createCollection(settings, root, []);
  }

  const clientPath = `${root}/${name}`;
  const softwarePath = `${clientPath}/Software`;
  const hardwarePath = `${clientPath}/Hardware`;
  const softwareGroups = toBwGroupAccess(
    (settings.softwareAccess ?? []) as CollectionAccessGrant[],
  );
  const hardwareGroups = toBwGroupAccess(
    (settings.hardwareAccess ?? []) as CollectionAccessGrant[],
  );

  let client = findCollectionByName(collections, clientPath);
  if (!client) {
    client = await createCollection(settings, clientPath, []);
  }

  // Apply defaults only when creating nested collections — existing
  // Software/Hardware access is owned by the Clients admin tab.
  let software = findCollectionByName(collections, softwarePath);
  if (!software) {
    software = await createCollection(settings, softwarePath, softwareGroups);
  }

  let hardware = findCollectionByName(collections, hardwarePath);
  if (!hardware) {
    hardware = await createCollection(settings, hardwarePath, hardwareGroups);
  }

  return {
    id: client.id,
    name,
    path: clientPath,
    softwareId: software.id,
    hardwareId: hardware.id,
  };
}
