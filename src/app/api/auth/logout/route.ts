import { jsonOk } from "@/lib/api";
import { appendAuditEvent } from "@/lib/audit";
import { getCurrentUser, getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await appendAuditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "auth.logout",
      scope: "Auth",
      detail: "Signed out",
    });
  }
  const session = await getSession();
  session.destroy();
  return jsonOk({ ok: true });
}
