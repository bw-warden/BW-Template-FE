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

export async function GET() {
  return withAdmin(async () => {
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    try {
      const [named, publicCols, groupsPayload] = await Promise.all([
        listCollections(settings!, { fresh: true }),
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
      ).map((client) => {
        const softwareGrants = client.softwareId
          ? accessById.get(client.softwareId) || []
          : [];
        const hardwareGrants = client.hardwareId
          ? accessById.get(client.hardwareId) || []
          : [];

        return {
          ...client,
          software: {
            collectionId: client.softwareId,
            groups: softwareGrants.map((g) => ({
              ...g,
              groupName: groupNameById.get(g.groupId) || g.groupId,
            })),
          },
          hardware: {
            collectionId: client.hardwareId,
            groups: hardwareGrants.map((g) => ({
              ...g,
              groupName: groupNameById.get(g.groupId) || g.groupId,
            })),
          },
        };
      });

      return jsonOk({
        clientsRoot: settings!.clientsRootName || "Clients",
        clients,
      });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
