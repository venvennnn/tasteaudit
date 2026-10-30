export type Verdict = "pass" | "fail" | "unknown";

export type ConstraintCheck = {
  label: string;
  verdict: Verdict;
  reason: string;
};

export type EntityFacts = {
  language?: string | null;
  tags?: string[];
};

function exclusionTerms(requirements: string): string[] {
  const matches = requirements.match(/\b(?:no|not|without|exclude)\s+([a-z][a-z\s-]{2,40})/gi) ?? [];
  return matches
    .map((match) => match.replace(/^(no|not|without|exclude)\s+/i, "").trim().toLowerCase())
    .map((term) => term.replace(/[^a-z\s-].*$/, "").trim())
    .filter((term) => term.length >= 3);
}

export function verifyConstraints(input: {
  language: string;
  requirements: string;
  facts: EntityFacts;
}): { checks: ConstraintCheck[]; known: number; total: number } {
  const checks: ConstraintCheck[] = [
    {
      label: "Hours",
      verdict: "unknown",
      reason: "Provider metadata does not prove current opening hours.",
    },
    {
      label: "Price",
      verdict: "unknown",
      reason: "No independent price evidence was checked against the stated budget.",
    },
    {
      label: "Edition or stock",
      verdict: "unknown",
      reason: "No live stock or edition check was performed.",
    },
    {
      label: "Accessibility",
      verdict: "unknown",
      reason: "No independent accessibility evidence was checked.",
    },
  ];

  const requested = input.language.trim().toLowerCase();
  const found = input.facts.language?.trim().toLowerCase() ?? "";
  if (!requested) {
    checks.push({ label: "Language", verdict: "unknown", reason: "No language requirement was stated." });
  } else if (!found) {
    checks.push({ label: "Language", verdict: "unknown", reason: "The entity metadata did not include a language." });
  } else if (found === requested || found.startsWith(requested) || requested.startsWith(found)) {
    checks.push({ label: "Language", verdict: "pass", reason: `Metadata language matches ${input.language}.` });
  } else {
    checks.push({
      label: "Language",
      verdict: "fail",
      reason: `Metadata language is ${input.facts.language}, which conflicts with ${input.language}.`,
    });
  }

  const tags = (input.facts.tags ?? []).map((tag) => tag.toLowerCase());
  const exclusions = exclusionTerms(input.requirements);
  if (exclusions.length === 0) {
    checks.push({
      label: "Stated exclusions",
      verdict: "unknown",
      reason: "No explicit exclusion was detected in the requirements.",
    });
  } else {
    const hit = exclusions.find((term) => tags.some((tag) => tag.includes(term)));
    if (hit) {
      checks.push({
        label: "Stated exclusions",
        verdict: "fail",
        reason: `A returned tag matches the exclusion “${hit}”.`,
      });
    } else if (tags.length === 0) {
      checks.push({
        label: "Stated exclusions",
        verdict: "unknown",
        reason: "No tags were returned, so the exclusion could not be checked.",
      });
    } else {
      checks.push({
        label: "Stated exclusions",
        verdict: "unknown",
        reason: "Returned tags do not prove the exclusion is satisfied.",
      });
    }
  }

  const known = checks.filter((check) => check.verdict !== "unknown").length;
  return { checks, known, total: checks.length };
}
