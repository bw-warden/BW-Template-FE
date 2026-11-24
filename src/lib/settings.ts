import { z } from "zod";
import {
  CollectionAccessGrant,
  CollectionAccessGrantSchema,
} from "@/lib/collection-access";
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from "@/lib/crypto";
import {
  getSettingsPayloadEnc,
  upsertSettingsPayloadEnc,
} from "@/lib/db";

export const RegionSchema = z.enum(["us", "eu"]);

export const DefaultSharedFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(120)
    .refine((v) => !v.includes("/"), {
      message: "Folder name cannot contain '/'",
    }),
  access: z.array(CollectionAccessGrantSchema),
});

export type DefaultSharedFolder = z.infer<typeof DefaultSharedFolderSchema>;

export const DefaultFoldersSchema = z
  .array(DefaultSharedFolderSchema)
  .superRefine((folders, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < folders.length; i++) {
      const key = folders[i].name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate default folder name: ${folders[i].name}`,
          path: [i, "name"],
        });
      }
      seen.add(key);
    }
  });

export type BitwardenSettings = {
  region: "us" | "eu";
  orgId: string;
  orgApiClientId: string;
  orgApiClientSecret: string;
  vaultApiClientId: string;
  vaultApiClientSecret: string;
  vaultMasterPassword: string;
  /** @deprecated Migrated into defaultFolders */
  operatorsGroupId: string;
  /** @deprecated Unused; kept for backward-compatible settings blobs */
  adminsGroupId: string;
  clientsRootName: string;
  templatesRootName: string;
  /** @deprecated Migrated into defaultFolders */
  softwareAccess: CollectionAccessGrant[];
  /** @deprecated Migrated into defaultFolders */
  hardwareAccess: CollectionAccessGrant[];
  defaultFolders: DefaultSharedFolder[];
};

export const SettingsUpdateSchema = z.object({
  region: RegionSchema.optional(),
  orgId: z.string().optional(),
  orgApiClientId: z.string().optional(),
  orgApiClientSecret: z.string().optional(),
  vaultApiClientId: z.string().optional(),
  vaultApiClientSecret: z.string().optional(),
  vaultMasterPassword: z.string().optional(),
  operatorsGroupId: z.string().optional(),
  adminsGroupId: z.string().optional(),
  clientsRootName: z.string().optional(),
  templatesRootName: z.string().optional(),
  softwareAccess: z.array(CollectionAccessGrantSchema).optional(),
  hardwareAccess: z.array(CollectionAccessGrantSchema).optional(),
  defaultFolders: DefaultFoldersSchema.optional(),
});

const EMPTY_DEFAULT_FOLDERS: DefaultSharedFolder[] = [
  { name: "Software", access: [] },
  { name: "Hardware", access: [] },
];

const DEFAULTS: BitwardenSettings = {
  region: "us",
  orgId: "",
  orgApiClientId: "",
  orgApiClientSecret: "",
  vaultApiClientId: "",
  vaultApiClientSecret: "",
  vaultMasterPassword: "",
  operatorsGroupId: "",
  adminsGroupId: "",
  clientsRootName: "Clients",
  templatesRootName: "Templates",
  softwareAccess: [],
  hardwareAccess: [],
  defaultFolders: [...EMPTY_DEFAULT_FOLDERS],
};

function migrateAccessDefaults(settings: BitwardenSettings): BitwardenSettings {
  const software = settings.softwareAccess ?? [];
  const hardware = settings.hardwareAccess ?? [];
  let defaultFolders = settings.defaultFolders ?? [];

  // Legacy operatorsGroupId → Software/Hardware grants when nothing else set.
  let nextSoftware = software;
  let nextHardware = hardware;
  if (
    settings.operatorsGroupId &&
    software.length === 0 &&
    hardware.length === 0 &&
    defaultFolders.length === 0
  ) {
    const grant: CollectionAccessGrant = {
      groupId: settings.operatorsGroupId,
      access: "edit",
    };
    nextSoftware = [grant];
    nextHardware = [grant];
  }

  if (defaultFolders.length === 0) {
    defaultFolders = [
      { name: "Software", access: nextSoftware },
      { name: "Hardware", access: nextHardware },
    ];
  }

  return {
    ...settings,
    softwareAccess: [],
    hardwareAccess: [],
    defaultFolders,
  };
}

export function getRegionUrls(region: "us" | "eu") {
  if (region === "eu") {
    return {
      identity: "https://identity.bitwarden.eu",
      api: "https://api.bitwarden.eu",
      webVault: "https://vault.bitwarden.eu",
    };
  }
  return {
    identity: "https://identity.bitwarden.com",
    api: "https://api.bitwarden.com",
    webVault: "https://vault.bitwarden.com",
  };
}

export async function loadSettings(): Promise<BitwardenSettings | null> {
  const enc = await getSettingsPayloadEnc();
  if (!enc) return null;
  try {
    const json = decryptSecret(enc);
    const parsed = { ...DEFAULTS, ...JSON.parse(json) } as BitwardenSettings;
    return migrateAccessDefaults(parsed);
  } catch {
    return null;
  }
}

export async function saveSettings(settings: BitwardenSettings): Promise<void> {
  const toStore = migrateAccessDefaults({
    ...settings,
    softwareAccess: [],
    hardwareAccess: [],
  });
  await upsertSettingsPayloadEnc(encryptSecret(JSON.stringify(toStore)));
}

export function mergeSettingsUpdate(
  current: BitwardenSettings | null,
  update: z.infer<typeof SettingsUpdateSchema>,
): BitwardenSettings {
  const base = migrateAccessDefaults(current ?? { ...DEFAULTS });
  const next = { ...base };

  const assignIfPresent = <K extends keyof BitwardenSettings>(
    key: K,
    value: BitwardenSettings[K] | undefined,
  ) => {
    if (value !== undefined && value !== "") {
      next[key] = value;
    }
  };

  if (update.region) next.region = update.region;
  assignIfPresent("orgId", update.orgId);
  assignIfPresent("orgApiClientId", update.orgApiClientId);
  assignIfPresent("orgApiClientSecret", update.orgApiClientSecret);
  assignIfPresent("vaultApiClientId", update.vaultApiClientId);
  assignIfPresent("vaultApiClientSecret", update.vaultApiClientSecret);
  assignIfPresent("vaultMasterPassword", update.vaultMasterPassword);
  if (update.operatorsGroupId !== undefined) {
    next.operatorsGroupId = update.operatorsGroupId;
  }
  if (update.adminsGroupId !== undefined) {
    next.adminsGroupId = update.adminsGroupId;
  }
  if (update.clientsRootName) next.clientsRootName = update.clientsRootName;
  if (update.templatesRootName) {
    next.templatesRootName = update.templatesRootName;
  }
  if (update.defaultFolders !== undefined) {
    next.defaultFolders = update.defaultFolders;
  } else if (
    update.softwareAccess !== undefined ||
    update.hardwareAccess !== undefined
  ) {
    // Legacy payload: fold into defaultFolders Software/Hardware entries.
    const folders = [...next.defaultFolders];
    const softIdx = folders.findIndex(
      (f) => f.name.toLowerCase() === "software",
    );
    const hardIdx = folders.findIndex(
      (f) => f.name.toLowerCase() === "hardware",
    );
    if (update.softwareAccess !== undefined) {
      if (softIdx >= 0) {
        folders[softIdx] = {
          ...folders[softIdx],
          access: update.softwareAccess,
        };
      } else {
        folders.push({ name: "Software", access: update.softwareAccess });
      }
    }
    if (update.hardwareAccess !== undefined) {
      if (hardIdx >= 0) {
        folders[hardIdx] = {
          ...folders[hardIdx],
          access: update.hardwareAccess,
        };
      } else {
        folders.push({ name: "Hardware", access: update.hardwareAccess });
      }
    }
    next.defaultFolders = folders;
  }

  next.softwareAccess = [];
  next.hardwareAccess = [];

  return next;
}

export type MaskedSettings = {
  configured: boolean;
  region: "us" | "eu";
  orgId: string;
  orgApiClientId: string;
  orgApiClientSecret: { configured: boolean };
  vaultApiClientId: string;
  vaultApiClientSecret: { configured: boolean };
  vaultMasterPassword: { configured: boolean };
  operatorsGroupId: string;
  adminsGroupId: string;
  clientsRootName: string;
  templatesRootName: string;
  defaultFolders: DefaultSharedFolder[];
};

export function toMaskedSettings(
  settings: BitwardenSettings | null,
): MaskedSettings {
  if (!settings) {
    return {
      configured: false,
      region: "us",
      orgId: "",
      orgApiClientId: "",
      orgApiClientSecret: { configured: false },
      vaultApiClientId: "",
      vaultApiClientSecret: { configured: false },
      vaultMasterPassword: { configured: false },
      operatorsGroupId: "",
      adminsGroupId: "",
      clientsRootName: "Clients",
      templatesRootName: "Templates",
      defaultFolders: [...EMPTY_DEFAULT_FOLDERS],
    };
  }

  const migrated = migrateAccessDefaults(settings);

  return {
    configured: Boolean(
      settings.orgId &&
        settings.orgApiClientId &&
        settings.orgApiClientSecret &&
        settings.vaultApiClientId &&
        settings.vaultApiClientSecret &&
        settings.vaultMasterPassword,
    ),
    region: settings.region,
    orgId: settings.orgId,
    orgApiClientId: settings.orgApiClientId,
    orgApiClientSecret: maskSecret(settings.orgApiClientSecret),
    vaultApiClientId: settings.vaultApiClientId,
    vaultApiClientSecret: maskSecret(settings.vaultApiClientSecret),
    vaultMasterPassword: maskSecret(settings.vaultMasterPassword),
    operatorsGroupId: settings.operatorsGroupId,
    adminsGroupId: settings.adminsGroupId,
    clientsRootName: settings.clientsRootName || "Clients",
    templatesRootName: settings.templatesRootName || "Templates",
    defaultFolders: migrated.defaultFolders,
  };
}

export function settingsReady(settings: BitwardenSettings | null): boolean {
  if (!settings) return false;
  return Boolean(
    settings.orgId &&
      settings.orgApiClientId &&
      settings.orgApiClientSecret &&
      settings.vaultApiClientId &&
      settings.vaultApiClientSecret &&
      settings.vaultMasterPassword,
  );
}
