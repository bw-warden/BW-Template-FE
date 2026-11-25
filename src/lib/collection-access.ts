import { z } from "zod";
import type { BwCollection } from "@/lib/bitwarden/public-api";

/** Bitwarden collection permission levels (Public API flags). */
export const CollectionAccessLevelSchema = z.enum([
  "view",
  "viewExceptPasswords",
  "edit",
  "manage",
]);
export type CollectionAccessLevel = z.infer<typeof CollectionAccessLevelSchema>;

export const ACCESS_LEVEL_OPTIONS: Array<{
  value: CollectionAccessLevel;
  label: string;
}> = [
  { value: "view", label: "Can view" },
  { value: "viewExceptPasswords", label: "Can view, except passwords" },
  { value: "edit", label: "Can edit" },
  { value: "manage", label: "Can manage" },
];

export const CollectionAccessGrantSchema = z.object({
  groupId: z.string().min(1),
  // Accept legacy "view" | "edit" plus full Bitwarden set.
  access: CollectionAccessLevelSchema,
});
export type CollectionAccessGrant = z.infer<typeof CollectionAccessGrantSchema>;

export function toBwGroupAccess(
  grants: CollectionAccessGrant[],
): NonNullable<BwCollection["groups"]> {
  return grants.map((g) => {
    switch (g.access) {
      case "manage":
        return {
          id: g.groupId,
          readOnly: false,
          hidePasswords: false,
          manage: true,
        };
      case "viewExceptPasswords":
        return {
          id: g.groupId,
          readOnly: true,
          hidePasswords: true,
          manage: false,
        };
      case "view":
        return {
          id: g.groupId,
          readOnly: true,
          hidePasswords: false,
          manage: false,
        };
      case "edit":
      default:
        return {
          id: g.groupId,
          readOnly: false,
          hidePasswords: false,
          manage: false,
        };
    }
  });
}

function accessFromBwFlags(entry: {
  manage: boolean;
  readOnly: boolean;
  hidePasswords: boolean;
}): CollectionAccessLevel {
  if (entry.manage) return "manage";
  if (entry.readOnly && entry.hidePasswords) return "viewExceptPasswords";
  if (entry.readOnly) return "view";
  return "edit";
}

export function fromBwGroupAccess(
  groups: NonNullable<BwCollection["groups"]> | undefined,
): CollectionAccessGrant[] {
  if (!groups?.length) return [];
  return groups.map((g) => ({
    groupId: g.id,
    access: accessFromBwFlags(g),
  }));
}

export type ReportAccessGrant = {
  principalId: string;
  principal: string;
  kind: "Group" | "User";
  access: CollectionAccessLevel;
  accessLabel: string;
};

export function accessLevelLabel(access: CollectionAccessLevel): string {
  return (
    ACCESS_LEVEL_OPTIONS.find((o) => o.value === access)?.label || access
  );
}

/** Map Public API group + user access arrays into report grants. */
export function fromBwCollectionAccess(opts: {
  groups?: NonNullable<BwCollection["groups"]>;
  users?: NonNullable<BwCollection["users"]>;
  groupNameById: Map<string, string>;
  userLabelById: Map<string, string>;
}): ReportAccessGrant[] {
  const grants: ReportAccessGrant[] = [];
  for (const g of opts.groups ?? []) {
    const access = accessFromBwFlags(g);
    grants.push({
      principalId: g.id,
      principal: opts.groupNameById.get(g.id) || g.id,
      kind: "Group",
      access,
      accessLabel: accessLevelLabel(access),
    });
  }
  for (const u of opts.users ?? []) {
    const access = accessFromBwFlags(u);
    grants.push({
      principalId: u.id,
      principal: opts.userLabelById.get(u.id) || u.id,
      kind: "User",
      access,
      accessLabel: accessLevelLabel(access),
    });
  }
  return grants.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "Group" ? -1 : 1;
    return a.principal.localeCompare(b.principal);
  });
}
