import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BellIcon, BookIcon } from "@/components/icons";

export default function HomePage() {
  return (
    <div className="home">
      <SiteHeader tone="hero" />
      <section className="hero-home">
        <div className="hero-copy">
          <p className="eyebrow">03 / Constellation of tastes</p>
          <h1 className="display">Does your AI understand your next customer?</h1>
          <p className="lede">Audit recommendations across markets. Connect taste with cultural evidence.</p>
          <div className="actions">
            <Link className="btn" href="/demo" data-testid="cta-demo">Try the demo <span aria-hidden="true">↗</span></Link>
            <Link className="text-link" href="/audit" data-testid="cta-audit">Audit your company <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <aside className="glass-float" aria-label="Simulated assistants">
          <p className="float-kicker">One assistant. New perspectives.</p>
          <div className="mini-pair">
            <Link href="/demo">
              <BellIcon />
              <strong>The concierge</strong>
              <small>Marriott-style assistant</small>
            </Link>
            <Link href="/demo">
              <BookIcon />
              <strong>The bookseller</strong>
              <small>Barnes & Noble-style assistant</small>
            </Link>
          </div>
          <p className="note">Simulated assistants · No brand affiliation</p>
        </aside>
        <nav className="home-journey" aria-label="What an audit walks through">
          <ol>
            <li><Link href="/demo"><span className="journey-dot" data-on="true" />Choose a customer</Link></li>
            <li><Link href="/demo"><span className="journey-dot" />Test the answer</Link></li>
            <li><Link href="/results"><span className="journey-dot" />Inspect the evidence</Link></li>
          </ol>
        </nav>
      </section>
      <section className="how" id="how">
        <p className="eyebrow">How it works</p>
        <h2>Same customer. Two answers. One measured change.</h2>
        <div className="how-grid">
          <article className="card">
            <span>1</span>
            <h3>Choose an assistant</h3>
            <p>Test a familiar simulated assistant, or describe your own company scenario. A company name does not connect that company’s model.</p>
          </article>
          <article className="card">
            <span>2</span>
            <h3>Add a customer</h3>
            <p>Every approach receives the same stated interests, city, budget, language, and practical needs.</p>
          </article>
          <article className="card">
            <span>3</span>
            <h3>Compare the evidence</h3>
            <p>Qloo scores the names. The results show how the mean affinity moved from the plain model list to the Qloo revision.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
