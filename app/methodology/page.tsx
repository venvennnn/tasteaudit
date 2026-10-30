import { SiteHeader } from "@/components/SiteHeader";

export default function MethodologyPage() {
  return (
    <div className="workspace">
      <SiteHeader tone="workspace" />
      <article className="page-intro">
        <h1>Methodology</h1>
        <p>TasteAudit asks whether a simulated assistant’s recommendations fit the interests and constraints a customer actually stated. It is a demonstration and a working audit for one session, not a claim about a brand’s production model.</p>
      </article>
      <div className="stack">
        <section className="card">
          <h2>What is stored</h2>
          <p>The current inputs and results live in React state in this tab. Refreshing or closing the tab clears them. The app does not use local storage, session storage, or a database. Download a JSON or CSV file if you want a copy. That file stays on your device until you move it.</p>
          <p>No application storage is not the same as no provider processing. Interests and answers are sent to the Qloo and Gemini credentials configured on the server. TasteAudit does not promise zero retention by those providers, by hosting logs, or by network infrastructure. The app avoids writing customer prompts and raw provider payloads to its own logs.</p>
        </section>
        <section className="card">
          <h2>Evidence</h2>
          <p>Favorite names and recommendation names are searched with Qloo’s <code>/search</code> parameters <code>query</code>, <code>types</code>, <code>page</code>, and <code>take</code>. An exact normalized name inside the expected type is preferred. Otherwise the first type-compatible candidate is provisional and can be corrected. An unmatched name stays unmatched.</p>
          <p>Discovery and scoring use <code>GET /v2/insights</code> with <code>filter.type</code> of <code>urn:entity:book</code> or <code>urn:entity:place</code>, <code>signal.interests.entities</code>, and <code>feature.explainability=true</code>. Places can also send <code>filter.location.query</code>. Books do not. A city sent only to Gemini does not make book scores city-conditioned. Scoring sends the shared pool through <code>filter.results.entities</code> and reads <code>query.affinity</code>. Missing affinity is not zero. Missing explainability is labeled unavailable.</p>
          <p>An explicit age can be mapped to a documented Qloo age band and is shown before it is sent. Gender is never inferred. Audience ids are not sent. Optional entity metadata does not prove hours, stock, price, or accessibility.</p>
        </section>
        <section className="card">
          <h2>Arms</h2>
          <p>Original Gemini and Gemini self-refinement share the same customer context and frozen generation settings. Self-refinement sees no Qloo evidence. Reranking the original names changes order only, so it does not raise the mean affinity of that same complete set. The grounded revision may choose different allowlisted ids, and a shorter list is disclosed. Pasted answers can be audited and revised, but their original model is unknown, so they are not a controlled model comparison.</p>
          <p>Affinity is a provider score for the signals that were sent. It is not preference accuracy, a purchase probability, or a business outcome. One profile cannot support a significance test. An optional A/B vote is an informal session review.</p>
        </section>
        <section className="card">
          <h2>Limits</h2>
          <p>Each provider route is stateless, validates its body, and returns. The browser runs the stage sequence and can retry a failed stage without repeating completed work. Closing the tab stops the run. There is no durable resume. Instance-level request throttling, if configured, resets with the server process and is not a global rate limit. Set spend limits on the provider accounts.</p>
        </section>
      </div>
    </div>
  );
}
