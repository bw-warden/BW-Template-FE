import { timingSafeEqual } from "crypto";
import { jsonError, jsonOk, jsonServerError } from "@/lib/api";
import { keepVaultAlive } from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

function keepaliveSecret(): string | null {
  const dedicated = process.env.VAULT_KEEPALIVE_SECRET?.trim();
  if (dedicated) return dedicated;
  const app = process.env.APP_SECRET?.trim();
  return app || null;
}

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header?.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token || token.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

async function handle(request: Request) {
  const secret = keepaliveSecret();
  if (!secret) {
    return jsonError(
      "VAULT_KEEPALIVE_SECRET (or APP_SECRET) is not configured",
      503,
    );
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return jsonError("Unauthorized", 401);
  }

  const settings = await loadSettings();
  if (!settingsReady(settings)) {
    return jsonError("Bitwarden settings not configured", 400);
  }

  const url = new URL(request.url);
  const sync =
    url.searchParams.get("sync") === "1" ||
    url.searchParams.get("sync") === "true";

  try {
    const result = await keepVaultAlive(settings!, { sync });
    return jsonOk(result);
  } catch (err) {
    return jsonServerError(err);
  }
}

/** GET/POST so Task Scheduler / curl / cron can ping either way. */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
