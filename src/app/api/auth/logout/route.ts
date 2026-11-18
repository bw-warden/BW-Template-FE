import { jsonOk } from "@/lib/api";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return jsonOk({ ok: true });
}
