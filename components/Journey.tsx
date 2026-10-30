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
              <span className="journey-dot" data-on={number <= active ? "true" : "false"} />
              <span className="journey-label"><b>{step.n}</b> {step.label}</span>
            </>
          );
          return (
            <li key={step.n} data-current={number === active ? "true" : "false"}>
              {step.label === "Results" ? <Link href="/results">{body}</Link> : body}
            </li>
          );
        })}
      </ol>
      <p>Session only · No login needed</p>
    </nav>
  );
}
