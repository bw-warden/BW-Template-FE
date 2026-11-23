import { jsonError, jsonOk, withAdmin } from "@/lib/api";
import { testOrgConnection } from "@/lib/bitwarden/public-api";
import { testVaultConnection } from "@/lib/bitwarden/vault";
import { loadSettings, settingsReady } from "@/lib/settings";

export const runtime = "nodejs";

export async function POST() {
  return withAdmin(async () => {
    const settings = loadSettings();
    if (!settingsReady(settings)) {
      return jsonError(
        "Settings incomplete — save org API and vault credentials first",
        400,
      );
    }

    const [org, vault] = await Promise.all([
      testOrgConnection(settings!),
      testVaultConnection(settings!),
    ]);

    return jsonOk({
      ok: org.ok && vault.ok,
      org,
      vault,
    });
  });
}
