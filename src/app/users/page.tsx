import { AppFooter } from "@/components/AppFooter";
import { AppHeader } from "@/components/AppHeader";
import { PageHero } from "@/components/PageHero";
import { UsersAdmin } from "@/components/UsersAdmin";
import { requireAppSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { email } = await requireAppSession({ admin: true });

  return (
    <div className="app-shell">
      <AppHeader email={email} isAdmin />
      <PageHero
        kicker="Access"
        title="Users"
        copy="Members can create clients and apply templates to them. Only admins can manage clients, templates, users, and settings."
      />
      <main className="main">
        <UsersAdmin />
      </main>
      <AppFooter />
    </div>
  );
}
