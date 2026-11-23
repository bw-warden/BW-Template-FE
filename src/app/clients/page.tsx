import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { ClientsAdmin } from "@/components/ClientsAdmin";
import { PageHero } from "@/components/PageHero";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { email } = await requireAppSession({ admin: true });

  return (
    <div className="app-shell">
      <AppHeader email={email} isAdmin />
      <PageHero
        kicker="Collections"
        title="Clients"
        copy="Review every client collection and adjust Software and Hardware group permissions in Bitwarden."
      />
      <main className="main">
        <ClientsAdmin />
      </main>
      <AppFooter />
    </div>
  );
}
