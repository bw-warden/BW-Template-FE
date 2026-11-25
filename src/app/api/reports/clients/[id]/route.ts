import { jsonError, jsonOk, jsonServerError, withAdmin } from "@/lib/api";
import {
  buildClientFolderTree,
  type BwCollectionAccessEntry,
  type BwMember,
  type ClientFolderTreeNode,
  listCollections,
  listPublicCollections,
  listPublicMembers,
} from "@/lib/bitwarden/public-api";
import { listItemsInCollection } from "@/lib/bitwarden/vault";
import { fromBwCollectionAccess } from "@/lib/collection-access";
import { getCachedGroupsPayload } from "@/lib/groups";
import {
  type BitwardenSettings,
  loadSettings,
  settingsReady,
} from "@/lib/settings";

export const runtime = "nodejs";

type ReportItem = {
  id: string;
  name: string;
  type: number;
};

type ReportFolderNode = {
  name: string;
  path: string;
  collectionId: string;
  items: ReportItem[];
  grants: ReturnType<typeof fromBwCollectionAccess>;
  children: ReportFolderNode[];
};

type AccessBundle = {
  groups?: BwCollectionAccessEntry[];
  users?: BwCollectionAccessEntry[];
};

async function hydrateTree(
  node: ClientFolderTreeNode,
  opts: {
    settings: BitwardenSettings;
    accessById: Map<string, AccessBundle>;
    groupNameById: Map<string, string>;
    userLabelById: Map<string, string>;
  },
): Promise<ReportFolderNode> {
  const access = opts.accessById.get(node.id);
  const grants = fromBwCollectionAccess({
    groups: access?.groups,
    users: access?.users,
    groupNameById: opts.groupNameById,
    userLabelById: opts.userLabelById,
  });

  let items: ReportItem[] = [];
  if (node.id) {
    const vaultItems = await listItemsInCollection(opts.settings, node.id);
    items = vaultItems
      .filter((i) => (i.collectionIds ?? []).includes(node.id))
      .map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const children = await Promise.all(
    node.children.map((child) => hydrateTree(child, opts)),
  );

  return {
    name: node.name,
    path: node.path,
    collectionId: node.id,
    items,
    grants,
    children,
  };
}

function summarize(node: ReportFolderNode): {
  folderCount: number;
  itemCount: number;
  principals: Set<string>;
} {
  const principals = new Set<string>();
  for (const g of node.grants) principals.add(`${g.kind}:${g.principalId}`);
  let folderCount = 1;
  let itemCount = node.items.length;
  for (const child of node.children) {
    const sub = summarize(child);
    folderCount += sub.folderCount;
    itemCount += sub.itemCount;
    for (const p of sub.principals) principals.add(p);
  }
  return { folderCount, itemCount, principals };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAdmin(async () => {
    const settings = await loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    const { id } = await context.params;
    if (!id) return jsonError("Client id is required");

    try {
      const [named, publicCols, groupsPayload, members] = await Promise.all([
        listCollections(settings!, { fresh: false }),
        listPublicCollections(settings!),
        getCachedGroupsPayload(),
        listPublicMembers(settings!).catch((err) => {
          console.error(
            "[reports] members lookup failed:",
            err instanceof Error ? err.message : err,
          );
          return [] as BwMember[];
        }),
      ]);

      const clientCol = named.find((c) => c.id === id);
      if (!clientCol) return jsonError("Client not found", 404);

      const clientsRoot = settings!.clientsRootName || "Clients";
      const prefix = `${clientsRoot}/`;
      if (
        !clientCol.name.startsWith(prefix) ||
        clientCol.name.slice(prefix.length).includes("/")
      ) {
        return jsonError("Not a client Shared Folder root", 400);
      }

      const treeSkeleton = buildClientFolderTree(named, clientCol.name);
      if (!treeSkeleton) return jsonError("Client not found", 404);

      const accessById = new Map(
        publicCols.map((c) => [
          c.id,
          { groups: c.groups, users: c.users },
        ]),
      );
      const groupNameById = new Map(
        groupsPayload.groups.map((g) => [g.id, g.name]),
      );
      const userLabelById = new Map(
        members.map((m) => [m.id, m.email]),
      );

      const tree = await hydrateTree(treeSkeleton, {
        settings: settings!,
        accessById,
        groupNameById,
        userLabelById,
      });

      const stats = summarize(tree);

      return jsonOk({
        client: {
          id: clientCol.id,
          name: clientCol.name.slice(prefix.length),
          path: clientCol.name,
        },
        tree,
        summary: {
          folderCount: stats.folderCount,
          itemCount: stats.itemCount,
          principalCount: stats.principals.size,
        },
      });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
