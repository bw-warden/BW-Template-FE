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

export async function getCachedGroupsPayload(): Promise<GroupsPayload> {
  const groups = await listCachedGroups();
  return {
    groups,
    syncedAt: await getGroupsSyncedAt(),
  };
}

export async function refreshGroupsFromBitwarden(): Promise<GroupsPayload> {
  const settings = await loadSettings();
  if (!settingsReady(settings)) {
    throw new Error("Bitwarden settings not configured");
  }
  const remote = await listGroups(settings!);
  const groups = await replaceCachedGroups(remote);
  return {
    groups,
    syncedAt: await getGroupsSyncedAt(),
  };
}

/** Fire-and-forget sync after login; never throws to the caller. */
export function syncGroupsInBackground(): void {
  void (async () => {
    try {
      if (!settingsReady(await loadSettings())) return;
      await refreshGroupsFromBitwarden();
    } catch {
      // Login must not fail if group sync fails.
    }
  })();
}
