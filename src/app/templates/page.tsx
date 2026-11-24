import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { PageHero } from "@/components/PageHero";
import { TemplatesAdmin } from "@/components/TemplatesAdmin";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { email, settingsConfigured } = await requireAppSession({ admin: true });

  return (
    <div className="app-shell">
      <AppHeader email={email} isAdmin />
      <PageHero
        kicker="Template library"
        title="Templates"
        copy="Manage field shapes in the Templates Shared Folder. Operators never need Bitwarden access to Templates — the service account clones items for them."
      />
      <main className="main">
        <TemplatesAdmin configured={settingsConfigured} />
      </main>
      <AppFooter />
    </div>
  );
}
