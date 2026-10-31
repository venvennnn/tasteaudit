"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

const LINKS = [
  { href: "/", label: "Overview", testId: "nav-overview" },
  { href: "/demo", label: "Guided Demo", testId: "nav-demo" },
  { href: "/regional", label: "Regional", testId: "nav-regional" },
  { href: "/audit", label: "Personalized", testId: "nav-audit" },
  { href: "/results", label: "Results", testId: "nav-results-header" },
  { href: "/methodology", label: "Methodology", testId: "nav-methodology" },
];

export function SiteHeader({ resettable = true }: { resettable?: boolean }) {
  const pathname = usePathname();
  const { reset } = useSession();

  function current(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="ta-header">
      <div className="ta-header-inner">
        <Link href="/" className="ta-brand">
          <span className="ta-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <strong>TasteAudit</strong>
            <small>AI Recommendation Audits</small>
          </span>
        </Link>
        <nav className="ta-nav" aria-label="Primary">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current(link.href) ? "page" : undefined} data-testid={link.testId}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ta-tools">
          <span className="ta-chip"><i className="live-dot" aria-hidden="true" />Session: In-Memory</span>
          {resettable ? (
            <button type="button" className="ta-reset" data-testid="reset-session" onClick={reset}>Reset</button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
