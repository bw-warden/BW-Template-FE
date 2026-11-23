import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { PageHero } from "@/components/PageHero";
import { ProvisionWizard } from "@/components/ProvisionWizard";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { email, isAdmin, settingsConfigured } = await requireAppSession();

  return (
    <div className="app-shell">
      <AppHeader email={email} isAdmin={isAdmin} />
      <PageHero
        title="Provision templates"
        copy="Pick a client, choose templates, and clone them into Software or Hardware as new vault items."
      />
      <main className="main">
        <ProvisionWizard configured={settingsConfigured} isAdmin={isAdmin} />
      </main>
      <AppFooter />
    </div>
  );
}
