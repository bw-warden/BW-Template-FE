import { z } from "zod";
import { jsonError, jsonOk, jsonServerError, withAuth } from "@/lib/api";
import {
  listClientNodes,
  listCollections,
  provisionClient,
} from "@/lib/bitwarden/public-api";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withAuth(async () => {
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError("Bitwarden settings not configured", 400);
    }

    const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
    const collections = await listCollections(settings!);
    let clients = listClientNodes(
      collections,
      settings!.clientsRootName || "Clients",
    );
    if (q) {
      clients = clients.filter((c) => c.name.toLowerCase().includes(q));
    }
    return jsonOk({
      clientsRoot: settings!.clientsRootName || "Clients",
      clients,
    });
  });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
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

    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Client name is required");
    }

    try {
      const client = await provisionClient(settings!, parsed.data.name);
      return jsonOk({ client });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
