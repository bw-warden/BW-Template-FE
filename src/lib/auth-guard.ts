import { redirect } from "next/navigation";
import { countUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { loadSettings, settingsReady, toMaskedSettings } from "@/lib/settings";

export async function requireAppSession(opts: { admin?: boolean } = {}) {
  const hasAdmin = (await countUsers()) > 0;
  if (!hasAdmin) redirect("/setup");

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (opts.admin && user.role !== "admin") {
    redirect("/");
  }

  const settings = await loadSettings();
  return {
    email: user.email,
    role: user.role,
    isAdmin: user.role === "admin",
    settingsConfigured: settingsReady(settings),
    maskedSettings: toMaskedSettings(settings),
  };
}

export async function redirectIfAuthenticated() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }
  return (await countUsers()) > 0;
}
