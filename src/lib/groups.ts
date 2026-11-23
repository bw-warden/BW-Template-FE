import { listGroups } from "@/lib/bitwarden/public-api";
import {
  CachedBwGroup,
  getGroupsSyncedAt,
  listCachedGroups,
  replaceCachedGroups,
} from "@/lib/db";
import { loadSettings, settingsReady } from "@/lib/settings";

export type GroupsPayload = {
  groups: CachedBwGroup[];
  syncedAt: string | null;
};

export function getCachedGroupsPayload(): GroupsPayload {
  return {
    groups: listCachedGroups(),
    syncedAt: getGroupsSyncedAt(),
  };
}

export async function refreshGroupsFromBitwarden(): Promise<GroupsPayload> {
  const settings = loadSettings();
  if (!settingsReady(settings)) {
    throw new Error("Bitwarden settings not configured");
  }
  const remote = await listGroups(settings!);
  const groups = replaceCachedGroups(remote);
  return {
    groups,
    syncedAt: getGroupsSyncedAt(),
  };
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
