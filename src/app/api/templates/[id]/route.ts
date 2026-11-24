import { z } from "zod";
import { jsonError, jsonOk, jsonServerError, withAdmin, withAuth } from "@/lib/api";
import {
  deleteTemplateItem,
  getItem,
  toSafeTemplate,
  toTemplateForm,
  updateTemplateItem,
  VaultField,
} from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";
import { templatesCollection } from "@/lib/templates";
import { REQUIRED_FIELD_NAME } from "@/lib/template-fields";

export const runtime = "nodejs";

/** Form defaults for the new-item modal. Any signed-in user. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await context.params;
    try {
      const { settings, collectionId } = await templatesCollection();
      const item = await getItem(settings, id);
      if (!(item.collectionIds ?? []).includes(collectionId)) {
        return jsonError("Template not found", 404);
      }
      return jsonOk({ template: toTemplateForm(item) });
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

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().optional(),
  fields: z.array(FieldSchema).optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAdmin(async () => {
    const { id } = await context.params;
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

    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid update");
    }

    try {
      const updated = await updateTemplateItem(settings!, id, {
        name: parsed.data.name,
        notes: parsed.data.notes,
        fields: parsed.data.fields as VaultField[] | undefined,
      });
      return jsonOk({ template: toSafeTemplate(updated) });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAdmin(async () => {
    const { id } = await context.params;
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    try {
      await deleteTemplateItem(settings!, id);
      return jsonOk({ ok: true });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
