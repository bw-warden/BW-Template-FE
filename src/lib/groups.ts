import { listGroups } from "@/lib/bitwarden/public-api";
import {
  CachedBwGroup,
  getGroupsSyncedAt,
  listCachedGroups,
  replaceCachedGroups,
} from "@/lib/db";
import { getCachedGroups, setCachedGroups } from "@/lib/redis";
import { loadSettings, settingsReady } from "@/lib/settings";

export type GroupsPayload = {
  groups: CachedBwGroup[];
  syncedAt: string | null;
};

function sqliteGroupsPayload(): GroupsPayload {
  return {
    groups: listCachedGroups(),
    syncedAt: getGroupsSyncedAt(),
  };
}

/** Redis first, then SQLite; backfill Redis on SQLite hit when configured. */
export async function getCachedGroupsPayload(): Promise<GroupsPayload> {
  const fromRedis = await getCachedGroups();
  if (fromRedis) {
    return {
      groups: fromRedis.groups,
      syncedAt: fromRedis.syncedAt,
    };
  }

  const fromSqlite = sqliteGroupsPayload();
  if (fromSqlite.groups.length > 0 || fromSqlite.syncedAt) {
    void setCachedGroups(fromSqlite);
  }
  return fromSqlite;
}

export async function refreshGroupsFromBitwarden(): Promise<GroupsPayload> {
  const settings = loadSettings();
  if (!settingsReady(settings)) {
    throw new Error("Bitwarden settings not configured");
  }
  const remote = await listGroups(settings!);
  const groups = replaceCachedGroups(remote);
  const payload: GroupsPayload = {
    groups,
    syncedAt: getGroupsSyncedAt(),
  };
  void setCachedGroups(payload);
  return payload;
}

/** Fire-and-forget sync after login; never throws to the caller. */
export function syncGroupsInBackground(): void {
  void (async () => {
    try {
      if (!settingsReady(loadSettings())) return;
      await refreshGroupsFromBitwarden();
    } catch {
      // Login must not fail if group sync fails.
    }
  })();
}
