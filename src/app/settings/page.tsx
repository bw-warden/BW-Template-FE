import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { BrandingSettings } from "@/components/BrandingSettings";
import { PageHero } from "@/components/PageHero";
import { SettingsForm } from "@/components/SettingsForm";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { email } = await requireAppSession({ admin: true });

  return (
    <div className="app-shell">
      <AppHeader email={email} isAdmin />
      <PageHero
        kicker="Connection"
        title="Settings"
        copy="Bitwarden Cloud connection and branding for this deployment. Secrets are encrypted at rest and never returned in full after save."
      />
      <main className="main stack">
        <BrandingSettings />
        <SettingsForm />
      </main>
      <AppFooter />
    </div>
  );
}
