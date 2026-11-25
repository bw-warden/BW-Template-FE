import { jsonError, jsonOk, withAdmin } from "@/lib/api";
import { appendAuditEvent } from "@/lib/audit";
import {
  loadSettings,
  mergeSettingsUpdate,
  saveSettings,
  SettingsUpdateSchema,
  toMaskedSettings,
} from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  return withAdmin(async () => {
    return jsonOk(toMaskedSettings(await loadSettings()));
  });
}

export async function PUT(request: Request) {
  return withAdmin(async (user) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const parsed = SettingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid settings");
    }

    const next = mergeSettingsUpdate(await loadSettings(), parsed.data);
    await saveSettings(next);
    const keys = Object.keys(parsed.data).filter((k) => k !== "vaultMasterPassword");
    await appendAuditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "settings.update",
      scope: "Settings",
      detail: keys.length
        ? `Updated: ${keys.join(", ")}`
        : "Updated Bitwarden settings",
    });
    return jsonOk(toMaskedSettings(next));
  });
}
