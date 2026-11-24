import { z } from "zod";
import { jsonError, jsonOk, jsonServerError, withAdmin, withAuth } from "@/lib/api";
import {
  createTemplateItem,
  listItemsInCollection,
  syncNow,
  toSafeTemplate,
  VaultField,
} from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";
import { templatesCollection as templatesCollectionId } from "@/lib/templates";
import { REQUIRED_FIELD_NAME } from "@/lib/template-fields";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withAuth(async () => {
    try {
      const fresh = new URL(request.url).searchParams.get("fresh") === "1";
      if (fresh) {
        const settings = await loadSettings();
        if (settingsReady(settings)) await syncNow(settings!);
      }
      const { settings, collectionId } = await templatesCollectionId();
      const items = await listItemsInCollection(settings, collectionId);
      return jsonOk({
        templates: items.map(toSafeTemplate),
      });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}

const FieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine((name) => name.trim() !== REQUIRED_FIELD_NAME, "That field name is reserved"),
  value: z.string().default(""),
  type: z.number().int().min(0).max(2).default(0),
  required: z.boolean().optional(),
});

const CreateSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  type: z.number().int().optional(),
  fields: z.array(FieldSchema).optional(),
});

export async function POST(request: Request) {
  return withAdmin(async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid template");
    }

    try {
      const { settings, collectionId } = await templatesCollectionId();
      const created = await createTemplateItem(settings, collectionId, {
        name: parsed.data.name,
        notes: parsed.data.notes,
        type: parsed.data.type,
        fields: parsed.data.fields as VaultField[] | undefined,
      });
      return jsonOk({ template: toSafeTemplate(created) });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
