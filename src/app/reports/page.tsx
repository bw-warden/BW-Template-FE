import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { PageHero } from "@/components/PageHero";
import { ReportsAdmin } from "@/components/ReportsAdmin";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { email } = await requireAppSession({ admin: true });

  return (
    <div className="app-shell">
      <AppHeader email={email} isAdmin />
      <PageHero
        kicker="Audit & inventory"
        title="Reports"
        copy="Review the full audit log and run per-client Shared Folder reports (nested folders, item names, and who has access)."
      />
      <main className="main">
        <ReportsAdmin />
      </main>
      <AppFooter />
    </div>
  );
}
