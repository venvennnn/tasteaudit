"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export function SiteHeader({ tone }: { tone: "hero" | "workspace" }) {
  const pathname = usePathname();
  const { state, reset } = useSession();
  const auditHref = state.scenario === "company" || pathname.startsWith("/audit") ? "/audit" : "/demo";
  const links = tone === "hero"
    ? [
        { href: "/", label: "Overview", testId: "nav-overview" },
        { href: "/#how", label: "How it works", testId: "nav-how" },
        { href: "/methodology", label: "Methodology", testId: "nav-methodology" },
      ]
    : [
        { href: "/", label: "Overview", testId: "nav-overview" },
        { href: auditHref, label: "Your audit", testId: auditHref === "/demo" ? "nav-demo" : "nav-audit" },
        { href: "/methodology", label: "Methodology", testId: "nav-methodology" },
      ];

  function current(href: string) {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/demo")) return pathname.startsWith("/demo");
    if (href.startsWith("/audit")) return pathname.startsWith("/audit");
    if (href.startsWith("/methodology")) return pathname.startsWith("/methodology");
    return false;
  }

  return (
    <header className={tone === "hero" ? "topbar" : "topbar workspace-bar"}>
      <Link href="/" className="brand">TasteAudit</Link>
      <nav className="nav-pill" aria-label="Primary">
        {links.map((link) => (
          <Link key={link.label} href={link.href} aria-current={current(link.href) ? "page" : undefined} data-testid={link.testId}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="bar-actions">
        {tone === "workspace" ? (
          <>
            <Link href="/results" data-testid="nav-results" aria-current={pathname.startsWith("/results") ? "page" : undefined}>Results</Link>
            <button type="button" className="text-btn" onClick={reset} data-testid="reset-session">Reset session</button>
            <Link href="/" className="text-link">Back to home <span aria-hidden="true">↗</span></Link>
          </>
        ) : <span className="bar-spacer" aria-hidden="true" />}
      </div>
    </header>
  );
}
