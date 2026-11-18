import { AppHeader } from "@/components/AppHeader";
import { SettingsForm } from "@/components/SettingsForm";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { email } = await requireAppSession();

  return (
    <div className="app-shell">
      <AppHeader email={email} />
      <main className="main">
        <h1 className="section-title">Settings</h1>
        <p className="section-copy">
          Bitwarden Cloud connection for this machine. Secrets are encrypted at
          rest and never returned in full after save.
        </p>
        <SettingsForm />
      </main>
    </div>
  );
}
