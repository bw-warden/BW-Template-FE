import { z } from "zod";
import { jsonError, jsonOk, withAuth } from "@/lib/api";
import {
  deleteTemplateItem,
  toSafeTemplate,
  updateTemplateItem,
  VaultField,
} from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

const FieldSchema = z.object({
  name: z.string().min(1),
  value: z.string().default(""),
  type: z.number().int().min(0).max(2).default(0),
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
  return withAuth(async () => {
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
      return jsonError(err instanceof Error ? err.message : String(err), 500);
    }
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await context.params;
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    try {
      await deleteTemplateItem(settings!, id);
      return jsonOk({ ok: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 500);
    }
  });
}
