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

export type BitwardenSettings = {
  region: "us" | "eu";
  orgId: string;
  orgApiClientId: string;
  orgApiClientSecret: string;
  vaultApiClientId: string;
  vaultApiClientSecret: string;
  vaultMasterPassword: string;
  /** @deprecated Migrated into softwareAccess/hardwareAccess */
  operatorsGroupId: string;
  /** @deprecated Unused; kept for backward-compatible settings blobs */
  adminsGroupId: string;
  clientsRootName: string;
  templatesRootName: string;
  softwareAccess: CollectionAccessGrant[];
  hardwareAccess: CollectionAccessGrant[];
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
});

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
};

function migrateAccessDefaults(settings: BitwardenSettings): BitwardenSettings {
  const software = settings.softwareAccess ?? [];
  const hardware = settings.hardwareAccess ?? [];
  if (
    settings.operatorsGroupId &&
    software.length === 0 &&
    hardware.length === 0
  ) {
    const grant: CollectionAccessGrant = {
      groupId: settings.operatorsGroupId,
      access: "edit",
    };
    return {
      ...settings,
      softwareAccess: [grant],
      hardwareAccess: [grant],
    };
  }
  return {
    ...settings,
    softwareAccess: software,
    hardwareAccess: hardware,
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

export function loadSettings(): BitwardenSettings | null {
  const enc = getSettingsPayloadEnc();
  if (!enc) return null;
  try {
    const json = decryptSecret(enc);
    const parsed = { ...DEFAULTS, ...JSON.parse(json) } as BitwardenSettings;
    return migrateAccessDefaults(parsed);
  } catch {
    return null;
  }
}

export function saveSettings(settings: BitwardenSettings): void {
  upsertSettingsPayloadEnc(encryptSecret(JSON.stringify(settings)));
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
  if (update.softwareAccess !== undefined) {
    next.softwareAccess = update.softwareAccess;
  }
  if (update.hardwareAccess !== undefined) {
    next.hardwareAccess = update.hardwareAccess;
  }

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
  softwareAccess: CollectionAccessGrant[];
  hardwareAccess: CollectionAccessGrant[];
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
      softwareAccess: [],
      hardwareAccess: [],
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
    softwareAccess: migrated.softwareAccess,
    hardwareAccess: migrated.hardwareAccess,
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
