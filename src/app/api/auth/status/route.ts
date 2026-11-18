import { jsonOk } from "@/lib/api";
import { countUsers } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  return jsonOk({
    hasAdmin: countUsers() > 0,
    authenticated: Boolean(session.isLoggedIn && session.userId),
    email: session.email ?? null,
  });
}
