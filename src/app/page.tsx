import { AppHeader } from "@/components/AppHeader";
import { ProvisionWizard } from "@/components/ProvisionWizard";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { email, settingsConfigured } = await requireAppSession();

  return (
    <div className="app-shell">
      <AppHeader email={email} />
      <main className="main">
        <h1 className="section-title">Provision templates</h1>
        <p className="section-copy">
          Pick a client, choose templates, and clone them into Software or
          Hardware as new vault items.
        </p>
        <ProvisionWizard configured={settingsConfigured} />
      </main>
    </div>
  );
}
