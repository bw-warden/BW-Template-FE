import { jsonError, jsonOk, withAdmin } from "@/lib/api";
import { refreshGroupsFromBitwarden } from "@/lib/groups";

export const runtime = "nodejs";

export async function POST() {
  return withAdmin(async () => {
    try {
      const payload = await refreshGroupsFromBitwarden();
      return jsonOk(payload);
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : String(err), 500);
    }
  });
}
