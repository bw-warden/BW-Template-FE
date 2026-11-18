import { AppHeader } from "@/components/AppHeader";
import { TemplatesAdmin } from "@/components/TemplatesAdmin";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { email, settingsConfigured } = await requireAppSession();

  return (
    <div className="app-shell">
      <AppHeader email={email} />
      <main className="main">
        <h1 className="section-title">Templates</h1>
        <p className="section-copy">
          Manage field shapes in the Templates collection. Operators never need
          Bitwarden access to Templates — the service account clones items for
          them.
        </p>
        <TemplatesAdmin configured={settingsConfigured} />
      </main>
    </div>
  );
}
