import { jsonError, jsonOk, jsonServerError, withAuth } from "@/lib/api";
import { findClientNode } from "@/lib/bitwarden/public-api";
import { countItemsInCollection, syncNow } from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }
    const { id } = await context.params;
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    try {
      if (fresh) await syncNow(settings!);
      const client = await findClientNode(settings!, id);
      if (!client) return jsonError("Client not found", 404);
      const [software, hardware] = await Promise.all([
        client.softwareId ? countItemsInCollection(settings!, client.softwareId) : 0,
        client.hardwareId ? countItemsInCollection(settings!, client.hardwareId) : 0,
      ]);
      return jsonOk({ software, hardware });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
