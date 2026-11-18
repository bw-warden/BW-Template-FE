import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/api";
import {
  listClientNodes,
  listCollections,
} from "@/lib/bitwarden/public-api";
import { cloneItemToCollection } from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

const ApplySchema = z.object({
  clientId: z.string().min(1),
  target: z.enum(["software", "hardware"]),
  templateIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: Request) {
  return withAuth(async () => {
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const parsed = ApplySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        parsed.error.issues[0]?.message || "Invalid apply payload",
      );
    }

    try {
      const collections = await listCollections(settings!);
      const clients = listClientNodes(
        collections,
        settings!.clientsRootName || "Clients",
      );
      const client = clients.find((c) => c.id === parsed.data.clientId);
      if (!client) {
        return jsonError("Client not found", 404);
      }

      const targetId =
        parsed.data.target === "software"
          ? client.softwareId
          : client.hardwareId;

      if (!targetId) {
        return jsonError(
          `${parsed.data.target} collection missing for this client — re-provision the client`,
          400,
        );
      }

      const results: Array<{
        templateId: string;
        ok: boolean;
        itemId?: string;
        name?: string;
        error?: string;
      }> = [];

      for (const templateId of parsed.data.templateIds) {
        try {
          const created = await cloneItemToCollection(
            settings!,
            templateId,
            targetId,
          );
          results.push({
            templateId,
            ok: true,
            itemId: created.id,
            name: created.name,
          });
        } catch (err) {
          results.push({
            templateId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return jsonOk({
        client,
        target: parsed.data.target,
        targetCollectionId: targetId,
        results,
        ok: results.every((r) => r.ok),
      });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 500);
    }
  });
}
