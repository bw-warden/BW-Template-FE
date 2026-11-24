import { z } from "zod";
import { jsonError, jsonOk, jsonServerError, withAdmin } from "@/lib/api";
import {
  findClientNode,
  updateCollectionAccess,
} from "@/lib/bitwarden/public-api";
import {
  CollectionAccessGrantSchema,
  toBwGroupAccess,
} from "@/lib/collection-access";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  software: z.array(CollectionAccessGrantSchema),
  hardware: z.array(CollectionAccessGrantSchema),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAdmin(async () => {
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    const { id } = await context.params;
    if (!id) return jsonError("Client id is required");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid access payload");
    }

    try {
      const client = await findClientNode(settings!, id);
      if (!client) return jsonError("Client not found", 404);

      if (!client.softwareId && !client.hardwareId) {
        return jsonError("Software and Hardware Shared Folders are missing", 400);
      }
      if (!client.softwareId) {
        return jsonError("Software Shared Folder is missing for this client", 400);
      }
      if (!client.hardwareId) {
        return jsonError("Hardware Shared Folder is missing for this client", 400);
      }

      await Promise.all([
        updateCollectionAccess(
          settings!,
          client.softwareId,
          `${client.path}/Software`,
          toBwGroupAccess(parsed.data.software),
        ),
        updateCollectionAccess(
          settings!,
          client.hardwareId,
          `${client.path}/Hardware`,
          toBwGroupAccess(parsed.data.hardware),
        ),
      ]);

      return jsonOk({
        ok: true,
        clientId: client.id,
        software: parsed.data.software,
        hardware: parsed.data.hardware,
      });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
