import { ENTITY_ID_PATTERN } from "@/lib/schemas/limits";

export type RepairSelection = {
  id: string;
  reason: string;
};

export function validateRepairSelections(
  selections: RepairSelection[],
  allowlist: string[],
  limit: number,
): { accepted: RepairSelection[]; warnings: string[] } {
  const allowed = new Set(allowlist.filter((id) => ENTITY_ID_PATTERN.test(id)));
  const accepted: RepairSelection[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const selection of selections) {
    const id = selection.id.trim();
    if (!ENTITY_ID_PATTERN.test(id) || !allowed.has(id)) {
      warnings.push("Dropped a choice because its id is unknown or not on the allowlist.");
      continue;
    }
    if (seen.has(id)) {
      warnings.push("Dropped a duplicate choice.");
      continue;
    }
    const reason = selection.reason.trim().slice(0, 400);
    if (!reason) {
      warnings.push("Dropped a choice that had no reason.");
      continue;
    }
    seen.add(id);
    accepted.push({ id, reason });
    if (accepted.length >= limit) {
      if (selections.length > limit) warnings.push(`Kept only ${limit} choices.`);
      break;
    }
  }
  return { accepted, warnings };
}
