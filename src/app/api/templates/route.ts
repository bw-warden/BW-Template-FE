import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/api";
import {
  ensureRootCollection,
  findCollectionByName,
  listCollections,
} from "@/lib/bitwarden/public-api";
import {
  createTemplateItem,
  listItemsInCollection,
  toSafeTemplate,
  VaultField,
} from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

async function templatesCollectionId() {
  const settings = loadSettings();
  if (!settingsReady(settings)) {
    throw new Error("Bitwarden settings not configured");
  }
  const rootName = settings!.templatesRootName || "Templates";
  const collections = await listCollections(settings!);
  let col = findCollectionByName(collections, rootName);
  if (!col) {
    col = await ensureRootCollection(settings!, rootName);
  }
  return { settings: settings!, collectionId: col.id };
}

export async function GET() {
  return withAuth(async () => {
    try {
      const { settings, collectionId } = await templatesCollectionId();
      const items = await listItemsInCollection(settings, collectionId);
      return jsonOk({
        templates: items.map(toSafeTemplate),
      });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 500);
    }
  });
}

const FieldSchema = z.object({
  name: z.string().min(1),
  value: z.string().default(""),
  type: z.number().int().min(0).max(2).default(0),
});

const CreateSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  type: z.number().int().optional(),
  fields: z.array(FieldSchema).optional(),
});

export async function POST(request: Request) {
  return withAuth(async () => {
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
      return jsonError(err instanceof Error ? err.message : String(err), 500);
    }
  });
}
