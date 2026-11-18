import { jsonError, jsonOk, withAuth } from "@/lib/api";
import {
  loadSettings,
  mergeSettingsUpdate,
  saveSettings,
  SettingsUpdateSchema,
  toMaskedSettings,
} from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  return withAuth(async () => {
    return jsonOk(toMaskedSettings(loadSettings()));
  });
}

export async function PUT(request: Request) {
  return withAuth(async () => {
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

    const next = mergeSettingsUpdate(loadSettings(), parsed.data);
    saveSettings(next);
    return jsonOk(toMaskedSettings(next));
  });
}
