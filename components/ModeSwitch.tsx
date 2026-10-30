import Link from "next/link";

export function ModeSwitch({ current }: { current: "demo" | "audit" }) {
  return (
    <div className="mode-switch">
      <Link href="/demo" aria-current={current === "demo" ? "page" : undefined}>Try a demo</Link>
      <Link href="/audit" aria-current={current === "audit" ? "page" : undefined}>Your company</Link>
    </div>
  );
}
