import { jsonOk } from "@/lib/api";
import { countUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  return jsonOk({
    hasAdmin: (await countUsers()) > 0,
    authenticated: Boolean(user),
    email: user?.email ?? null,
  });
}
