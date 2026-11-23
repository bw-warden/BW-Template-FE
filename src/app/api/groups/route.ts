import { jsonOk, withAdmin } from "@/lib/api";
import { getCachedGroupsPayload } from "@/lib/groups";

export const runtime = "nodejs";

export async function GET() {
  return withAdmin(async () => {
    return jsonOk(getCachedGroupsPayload());
  });
}
