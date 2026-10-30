import { z } from "zod";
import { EXPLAINABILITY_UNAVAILABLE, QLOO_AFFINITY_RETURNED } from "@/lib/audit/evidence";
import { validateRepairSelections } from "@/lib/audit/repair";
import { handleRoute } from "@/lib/http/route";
import { generateStructured, repairJsonSchema, repairPrompt, type GroundingLine } from "@/lib/providers/gemini";
import { repairRequestSchema } from "@/lib/schemas/api";
import { signingAvailable, verifyEvidence } from "@/lib/security/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const repairSchema = z.object({
  selections: z.array(z.object({ id: z.string(), reason: z.string() })),
  answer: z.string(),
});

function explainText(value: unknown): string {
  if (!value || typeof value !== "object") return "Unavailable";
  const record = value as { status?: string; contributions?: { name?: string | null; entityId?: string | null; value?: number }[] };
  if (record.status !== "available" || !Array.isArray(record.contributions) || record.contributions.length === 0) {
    return "Unavailable";
  }
  return record.contributions
    .map((item) => `${item.name ?? item.entityId ?? "signal"} ${item.value}`)
    .join("; ");
}

export function POST(request: Request) {
  return handleRoute(request, "gemini.repair", async (body, ctx) => {
    const input = repairRequestSchema.parse(body);
    const warnings: string[] = [];
    const lines: GroundingLine[] = [];
    let rejected = 0;
    const signing = signingAvailable();
    for (const candidate of input.candidates) {
      const verified = candidate.envelope ? verifyEvidence(candidate.envelope) : null;
      const envelopeMatches =
        verified !== null &&
        verified.entityId.toLowerCase() === candidate.entityId.toLowerCase() &&
        verified.domain === input.task.domain &&
        verified.seedIds.length === input.seedIds.length &&
        verified.seedIds.every((id) => input.seedIds.some((seed) => seed.toLowerCase() === id.toLowerCase()));
      const finite = typeof candidate.affinity === "number" && Number.isFinite(candidate.affinity);
      let affinity: number | null = null;
      let explainability = "Unavailable";
      let fromResponse = false;
      if (envelopeMatches && verified) {
        affinity = typeof verified.affinity === "number" && Number.isFinite(verified.affinity) ? verified.affinity : null;
        explainability = explainText(verified.explainability);
        fromResponse = affinity !== null;
      } else if (candidate.envelope || signing) {
        rejected += 1;
      } else if (candidate.evidenceOrigin !== "imported") {
        affinity = finite ? candidate.affinity : null;
        explainability = explainText(candidate.explainability);
        fromResponse = affinity !== null;
      }
      const statuses = [
        fromResponse ? QLOO_AFFINITY_RETURNED : null,
        explainability === "Unavailable" ? EXPLAINABILITY_UNAVAILABLE : null,
        ...(candidate.notes ?? []),
      ].filter((status): status is string => Boolean(status));
      lines.push({
        id: candidate.entityId,
        name: candidate.name,
        affinity: fromResponse ? affinity : null,
        statuses,
      });
    }
    if (rejected > 0) {
      warnings.push(`${rejected} candidate score${rejected === 1 ? "" : "s"} were not treated as provider-authenticated.`);
    }
    const result = await generateStructured({
      stage: "gemini.repair",
      prompt: repairPrompt(input.task, lines),
      jsonSchema: repairJsonSchema,
      parsed: repairSchema,
      signal: ctx.signal,
    });
    const validated = validateRepairSelections(
      result.data.selections,
      input.candidates.map((candidate) => candidate.entityId),
      input.task.count,
    );
    warnings.push(...validated.warnings);
    if (validated.accepted.length === 0) {
      warnings.push("The revision did not return any allowlisted choice.");
    }
    return {
      data: { selections: validated.accepted, answer: result.data.answer },
      warnings,
      provenance: { ...result.provenance, evidence: "Allowlisted choices. A numeric affinity is included only when this request returned it or a matching signed envelope confirmed it." },
    };
  });
}
