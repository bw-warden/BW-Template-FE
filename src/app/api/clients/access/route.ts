import { jsonError, jsonOk, jsonServerError, withAdmin } from "@/lib/api";
import {
  listClientNodes,
  listCollections,
  listPublicCollections,
} from "@/lib/bitwarden/public-api";
import { fromBwGroupAccess } from "@/lib/collection-access";
import { getCachedGroupsPayload } from "@/lib/groups";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withAdmin(async () => {
    const settings = await loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    // Default: reuse recent vault sync (≤60s). ?fresh=1 forces a sync on Reload.
    const fresh =
      new URL(request.url).searchParams.get("fresh") === "1";

    try {
      const [named, publicCols, groupsPayload] = await Promise.all([
        listCollections(settings!, { fresh }),
        listPublicCollections(settings!),
        getCachedGroupsPayload(),
      ]);

      const accessById = new Map(
        publicCols.map((c) => [c.id, fromBwGroupAccess(c.groups)]),
      );
      const groupNameById = new Map(
        groupsPayload.groups.map((g) => [g.id, g.name]),
      );

      const clients = listClientNodes(
        named,
        settings!.clientsRootName || "Clients",
      ).map((client) => ({
        id: client.id,
        name: client.name,
        path: client.path,
        folders: client.folders.map((folder) => {
          const grants = accessById.get(folder.id) || [];
          return {
            name: folder.name,
            collectionId: folder.id,
            groups: grants.map((g) => ({
              ...g,
              groupName: groupNameById.get(g.groupId) || g.groupId,
            })),
          };
        }),
      }));

      return jsonOk({
        clientsRoot: settings!.clientsRootName || "Clients",
        clients,
        groups: groupsPayload.groups.map((g) => ({
          id: g.id,
          name: g.name,
        })),
        syncedAt: groupsPayload.syncedAt,
      });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
