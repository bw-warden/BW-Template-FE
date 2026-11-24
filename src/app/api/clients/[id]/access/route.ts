import { z } from "zod";
import { jsonError, jsonOk, jsonServerError, withAdmin } from "@/lib/api";
import {
  findClientFolder,
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
  folders: z.array(
    z.object({
      name: z.string().trim().min(1),
      access: z.array(CollectionAccessGrantSchema),
    }),
  ),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAdmin(async () => {
    const settings = await loadSettings();
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

      if (client.folders.length === 0) {
        return jsonError("No nested Shared Folders found for this client", 400);
      }

      const missing: string[] = [];
      for (const entry of parsed.data.folders) {
        if (!findClientFolder(client, entry.name)) {
          missing.push(entry.name);
        }
      }
      if (missing.length > 0) {
        return jsonError(
          `Shared Folder${missing.length === 1 ? "" : "s"} missing: ${missing.join(", ")}`,
          400,
        );
      }

      await Promise.all(
        parsed.data.folders.map((entry) => {
          const folder = findClientFolder(client, entry.name)!;
          return updateCollectionAccess(
            settings!,
            folder.id,
            `${client.path}/${folder.name}`,
            toBwGroupAccess(entry.access),
          );
        }),
      );

      return jsonOk({
        ok: true,
        clientId: client.id,
        folders: parsed.data.folders,
      });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
