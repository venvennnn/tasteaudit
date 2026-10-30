import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <div className="atmosphere">
      <div className="blobs" aria-hidden="true">
        <div className="blob blob-a" />
        <div className="blob blob-b" />
        <div className="blob blob-c" />
      </div>
      <div className="ribs" aria-hidden="true" />
      <SiteHeader tone="hero" />
      <section className="hero">
        <div>
          <p className="kicker">Cultural evidence, kept inspectable</p>
          <h1 className="display">Your AI knows the words. Does it know the customer?</h1>
          <p className="lede">
            TasteAudit checks recommendations against cultural evidence and makes improvements inspectable.
            Qloo supplies cross-domain taste evidence. Gemini writes and revises the answer. Nothing about the run is stored after you leave this tab.
          </p>
          <div className="actions">
            <Link className="btn" href="/demo" data-testid="cta-demo">Try the demo</Link>
            <Link className="btn secondary" href="/audit" data-testid="cta-audit">Audit your company</Link>
          </div>
        </div>
        <aside className="preview" aria-label="Product layout preview">
          <header>
            <strong>Audit layout</strong>
            <span>Preview</span>
          </header>
          <div className="preview-card">
            <strong>Original answer</strong>
            <p>The assistant’s first recommendation, shown after a live run.</p>
          </div>
          <div className="preview-card">
            <strong>Evidence check</strong>
            <p>Resolved names, affinity when Qloo returns it, and gaps labeled unavailable.</p>
          </div>
          <div className="preview-card">
            <strong>Revised answer</strong>
            <p>A grounded revision that can only choose from the scored allowlist.</p>
          </div>
          <p className="note">This panel shows the workspace layout. It is not a measured outcome.</p>
        </aside>
      </section>
      <section className="feature-row" aria-label="What the audit shows">
        <p><span />Explicit interests, not inferred identity</p>
        <p><span />Cultural evidence from Qloo</p>
        <p><span />A revision you can inspect</p>
        <p><span />Stronger baselines when you ask</p>
        <p><span />Download the current session</p>
      </section>
    </div>
  );
}
