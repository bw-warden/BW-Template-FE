import { jsonOk, jsonServerError, withAdmin } from "@/lib/api";
import { AUDIT_ACTIONS, listAuditEvents } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withAdmin(async () => {
    try {
      const url = new URL(request.url);
      const q = url.searchParams.get("q") || undefined;
      const action = url.searchParams.get("action") || undefined;
      const from = url.searchParams.get("from") || undefined;
      const to = url.searchParams.get("to") || undefined;
      const beforeRaw = url.searchParams.get("before");
      const before = beforeRaw ? Number(beforeRaw) : undefined;
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : 100;

      const result = await listAuditEvents({
        q,
        action: action && action !== "all" ? action : undefined,
        from,
        to,
        before:
          before != null && Number.isFinite(before) ? before : undefined,
        limit: Number.isFinite(limit) ? limit : 100,
      });

      return jsonOk({
        ...result,
        actions: AUDIT_ACTIONS,
      });
    } catch (err) {
      return jsonServerError(err);
    }
  });
}
