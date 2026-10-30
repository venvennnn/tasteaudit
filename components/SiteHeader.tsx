"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export function SiteHeader() {
  const pathname = usePathname();
  const { state } = useSession();
  const company = state.scenario === "company" || pathname.startsWith("/audit");
  const third = pathname === "/"
    ? { href: "/demo", label: "Try the demo", testId: "cta-demo" }
    : pathname.startsWith("/results")
      ? { href: "#downloads", label: "Download session", testId: "nav-download" }
      : company
        ? { href: "/audit", label: "Your company", testId: "nav-audit" }
        : { href: "/demo", label: "Try the demo", testId: "nav-demo" };

  const links = [
    { href: "/", label: "Product", testId: "nav-overview" },
    { href: "/methodology", label: "Method", testId: "nav-methodology" },
    third,
  ];

  function current(href: string) {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/methodology")) return pathname.startsWith("/methodology");
    if (href.startsWith("/demo")) return pathname.startsWith("/demo");
    if (href.startsWith("/audit")) return pathname.startsWith("/audit");
    return false;
  }

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        TasteAudit
        <span className="brand-mark" aria-hidden="true" />
      </Link>
      <nav className="nav" aria-label="Primary">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            aria-current={current(link.href) ? "page" : undefined}
            data-testid={link.testId}
          >
            {link.label}
            {link.testId !== "nav-overview" && link.testId !== "nav-methodology" ? <span aria-hidden="true"> ↗</span> : null}
          </Link>
        ))}
      </nav>
    </header>
  );
}
