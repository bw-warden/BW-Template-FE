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

type TokenCache = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenCache>();

async function getOrgToken(settings: BitwardenSettings): Promise<string> {
  const cacheKey = `${settings.region}:${settings.orgApiClientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
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
    throw new Error(`Org API token failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
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
    const text = await res.text();
    throw new Error(`Bitwarden Public API ${path} failed (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function testOrgConnection(
  settings: BitwardenSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    await getOrgToken(settings);
    await listCollections(settings);
    return { ok: true, message: "Organization API token and collections list OK" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listCollections(
  settings: BitwardenSettings,
): Promise<BwCollection[]> {
  const data = await apiFetch<{ data?: BwCollection[] } | BwCollection[]>(
    settings,
    "/public/organization/collections",
  );
  if (Array.isArray(data)) return data;
  return data.data ?? [];
}

export async function createCollection(
  settings: BitwardenSettings,
  name: string,
  groups: BwCollection["groups"] = [],
): Promise<BwCollection> {
  return apiFetch<BwCollection>(settings, "/public/organization/collections", {
    method: "POST",
    body: JSON.stringify({
      name,
      externalId: null,
      groups: groups ?? [],
    }),
  });
}

export async function updateCollectionAccess(
  settings: BitwardenSettings,
  collectionId: string,
  name: string,
  groups: NonNullable<BwCollection["groups"]>,
): Promise<void> {
  await apiFetch(settings, `/public/organization/collections/${collectionId}`, {
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

export function operatorsEditGroup(
  operatorsGroupId: string | undefined,
): NonNullable<BwCollection["groups"]> {
  if (!operatorsGroupId) return [];
  return [
    {
      id: operatorsGroupId,
      readOnly: false,
      hidePasswords: false,
      manage: false, // Edit items only — never Manage
    },
  ];
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

export async function provisionClient(
  settings: BitwardenSettings,
  clientName: string,
): Promise<ClientNode> {
  const name = clientName.trim();
  if (!name) throw new Error("Client name is required");
  if (name.includes("/")) {
    throw new Error("Client name cannot contain '/'");
  }

  const root = settings.clientsRootName || "Clients";
  await ensureRootCollection(settings, root);

  let collections = await listCollections(settings);
  const clientPath = `${root}/${name}`;
  const softwarePath = `${clientPath}/Software`;
  const hardwarePath = `${clientPath}/Hardware`;
  const editGroups = operatorsEditGroup(settings.operatorsGroupId || undefined);

  let client = findCollectionByName(collections, clientPath);
  if (!client) {
    client = await createCollection(settings, clientPath, []);
  }

  collections = await listCollections(settings);
  let software = findCollectionByName(collections, softwarePath);
  if (!software) {
    software = await createCollection(settings, softwarePath, editGroups);
  } else if (editGroups.length) {
    await updateCollectionAccess(settings, software.id, softwarePath, editGroups);
  }

  collections = await listCollections(settings);
  let hardware = findCollectionByName(collections, hardwarePath);
  if (!hardware) {
    hardware = await createCollection(settings, hardwarePath, editGroups);
  } else if (editGroups.length) {
    await updateCollectionAccess(settings, hardware.id, hardwarePath, editGroups);
  }

  return {
    id: client.id,
    name,
    path: clientPath,
    softwareId: software.id,
    hardwareId: hardware.id,
  };
}
