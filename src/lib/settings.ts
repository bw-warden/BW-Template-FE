import { z } from "zod";
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
  operatorsGroupId: string;
  adminsGroupId: string;
  clientsRootName: string;
  templatesRootName: string;
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
};

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
    return { ...DEFAULTS, ...JSON.parse(json) } as BitwardenSettings;
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
  const base = current ?? { ...DEFAULTS };
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

  return next;
}

export type MaskedSettings = {
  configured: boolean;
  region: "us" | "eu";
  orgId: string;
  orgApiClientId: string;
  orgApiClientSecret: { configured: boolean; last4: string | null };
  vaultApiClientId: string;
  vaultApiClientSecret: { configured: boolean; last4: string | null };
  vaultMasterPassword: { configured: boolean; last4: string | null };
  operatorsGroupId: string;
  adminsGroupId: string;
  clientsRootName: string;
  templatesRootName: string;
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
      orgApiClientSecret: { configured: false, last4: null },
      vaultApiClientId: "",
      vaultApiClientSecret: { configured: false, last4: null },
      vaultMasterPassword: { configured: false, last4: null },
      operatorsGroupId: "",
      adminsGroupId: "",
      clientsRootName: "Clients",
      templatesRootName: "Templates",
    };
  }

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
