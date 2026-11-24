"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";

export function AppHeader({
  email,
  isAdmin = false,
}: {
  email: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const links = [
    { href: "/", label: "Provision" },
    ...(isAdmin
      ? [
          { href: "/clients", label: "Clients" },
          { href: "/templates", label: "Templates" },
          { href: "/users", label: "Users" },
          { href: "/settings", label: "Settings" },
        ]
      : []),
  ];

  return (
    <header className="site-header">
      <div className="brand">
        <BrandLogo height={36} />
        <div className="brand-sub">BW-Template-FE — client template provisioner</div>
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
