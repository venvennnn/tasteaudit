import Link from "next/link";

const STEPS = [
  { n: "01", label: "Company" },
  { n: "02", label: "Customer" },
  { n: "03", label: "Run" },
  { n: "04", label: "Results" },
];

export function Journey({ active }: { active: number }) {
  return (
    <nav className="journey" aria-label="Audit progress">
      <ol>
        {STEPS.map((step, index) => {
          const number = index + 1;
          const body = (
            <>
              <span className="dock-index">{step.n}</span>
              <span className="dock-label">{step.label}</span>
            </>
          );
          return (
            <li key={step.n} data-current={number === active ? "true" : "false"} data-done={number < active ? "true" : "false"}>
              {step.label === "Results" ? <Link href="/results" data-testid="nav-results">{body}</Link> : <span>{body}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
