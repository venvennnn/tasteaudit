export type ExtractedPick = {
  name: string;
  quote: string;
};

export function validateQuotes(answer: string, picks: ExtractedPick[], limit: number): { accepted: ExtractedPick[]; warnings: string[] } {
  const accepted: ExtractedPick[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    const name = pick.name.trim();
    const quote = pick.quote;
    if (!name || !quote) continue;
    if (!answer.includes(quote)) {
      warnings.push(`Dropped “${name}” because its quotation is not an exact substring of the answer.`);
      continue;
    }
    if (!quote.includes(name)) {
      warnings.push(`Dropped “${name}” because the quotation does not contain that name.`);
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push({ name, quote });
    if (accepted.length >= limit) break;
  }
  if (accepted.length === 0) warnings.push("No named recommendation passed the quotation check.");
  return { accepted, warnings };
}
