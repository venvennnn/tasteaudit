"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/demo", label: "Demo" },
  { href: "/audit", label: "Audit" },
  { href: "/results", label: "Results" },
];

export function SiteHeader({ tone }: { tone: "hero" | "workspace" }) {
  const pathname = usePathname();
  const { reset } = useSession();
  return (
    <header className={tone === "hero" ? "topbar" : "topbar workspace-bar"}>
      <Link href="/" className="brand">
        <span className="mark" aria-hidden="true" />
        TasteAudit
      </Link>
      <nav className="nav-pill" aria-label="Primary">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} data-testid={`nav-${link.label.toLowerCase()}`}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="bar-actions">
        <button type="button" className="text-btn" onClick={reset} data-testid="reset-session">
          Reset session
        </button>
        <Link href="/methodology" className="method-link" data-testid="nav-methodology">
          Methodology
        </Link>
      </div>
    </header>
  );
}
