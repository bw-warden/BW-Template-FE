import { redirect } from "next/navigation";
import { countUsers } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loadSettings, settingsReady, toMaskedSettings } from "@/lib/settings";

export async function requireAppSession() {
  const hasAdmin = countUsers() > 0;
  if (!hasAdmin) redirect("/setup");

  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    redirect("/login");
  }

  const settings = loadSettings();
  return {
    email: session.email ?? null,
    settingsConfigured: settingsReady(settings),
    maskedSettings: toMaskedSettings(settings),
  };
}

export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (session.isLoggedIn && session.userId) {
    redirect("/");
  }
  return countUsers() > 0;
}
