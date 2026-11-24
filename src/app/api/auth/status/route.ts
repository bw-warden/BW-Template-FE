import { jsonOk } from "@/lib/api";
import { countUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  return jsonOk({
    hasAdmin: countUsers() > 0,
    authenticated: Boolean(user),
    // Email only when the session is valid against the DB (not raw cookie).
    email: user?.email ?? null,
  });
}
