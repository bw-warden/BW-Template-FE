import { z } from "zod";
import { jsonError, jsonOk, jsonServerError, withAuth } from "@/lib/api";
import {
  findClientFolder,
  findClientNode,
} from "@/lib/bitwarden/public-api";
import {
  countItemsInCollection,
  createItemFromTemplate,
  RequiredFieldsError,
  VaultField,
} from "@/lib/bitwarden/vault";
import { templatesCollection } from "@/lib/templates";

export const runtime = "nodejs";

const FieldSchema = z.object({
  name: z.string().max(200),
  value: z.string().max(5000).default(""),
  type: z.number().int().min(0).max(2).default(0),
});

const CreateItemSchema = z.object({
  clientId: z.string().min(1),
  target: z.string().trim().min(1).max(120),
  templateId: z.string().min(1),
  item: z.object({
    name: z.string().trim().min(1, "Item name is required").max(500),
    notes: z.string().max(10000).optional(),
    login: z
      .object({
        username: z.string().max(500).optional(),
        password: z.string().max(5000).optional(),
        totp: z.string().max(1000).optional(),
        uris: z.array(z.string().max(2000)).max(20).optional(),
      })
      .optional(),
    fields: z.array(FieldSchema).max(100).optional(),
  }),
});

export async function POST(request: Request) {
  return withAuth(async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const parsed = CreateItemSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid item");
    }

    try {
      const { settings, collectionId: templatesId } = await templatesCollection();
      const client = await findClientNode(settings, parsed.data.clientId);
      if (!client) return jsonError("Client not found", 404);

      const folder = findClientFolder(client, parsed.data.target);
      if (!folder) {
        return jsonError(
          `Shared Folder “${parsed.data.target}” missing for this client. Re-create the client to repair it.`,
          400,
        );
      }

      const created = await createItemFromTemplate(
        settings,
        templatesId,
        parsed.data.templateId,
        folder.id,
        {
          ...parsed.data.item,
          fields: parsed.data.item.fields as VaultField[] | undefined,
        },
      );
      const count = await countItemsInCollection(settings, folder.id);
      return jsonOk({ item: created, target: folder.name, count });
    } catch (err) {
      if (err instanceof RequiredFieldsError) {
        return jsonError(err.message, 400);
      }
      return jsonServerError(err);
    }
  });
}
