"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function AppHeader({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const links = [
    { href: "/", label: "Provision" },
    { href: "/templates", label: "Templates" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <header className="site-header">
      <div className="brand">
        <div className="brand-mark">BW Konica</div>
        <div className="brand-sub">Client template provisioner</div>
      </div>
      <nav className="nav-links" aria-label="Primary">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            data-active={pathname === l.href ? "true" : "false"}
          >
            {l.label}
          </Link>
        ))}
        <span className="muted">{email}</span>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          Log out
        </button>
      </nav>
    </header>
  );
}
