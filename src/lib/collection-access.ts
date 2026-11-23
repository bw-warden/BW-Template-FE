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

export function fromBwGroupAccess(
  groups: NonNullable<BwCollection["groups"]> | undefined,
): CollectionAccessGrant[] {
  if (!groups?.length) return [];
  return groups.map((g) => {
    let access: CollectionAccessLevel;
    if (g.manage) {
      access = "manage";
    } else if (g.readOnly && g.hidePasswords) {
      access = "viewExceptPasswords";
    } else if (g.readOnly) {
      access = "view";
    } else {
      access = "edit";
    }
    return { groupId: g.id, access };
  });
}
