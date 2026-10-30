import { z } from "zod";
import { validateRepairSelections } from "@/lib/audit/repair";
import { handleRoute } from "@/lib/http/route";
import { generateStructured, repairJsonSchema, repairPrompt, type GroundingLine } from "@/lib/providers/gemini";
import { repairRequestSchema } from "@/lib/schemas/api";
import { verifyEvidence } from "@/lib/security/sign";

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
    let unsigned = 0;
    for (const candidate of input.candidates) {
      const verified = candidate.envelope ? verifyEvidence(candidate.envelope) : null;
      const authentic =
        verified !== null &&
        verified.entityId.toLowerCase() === candidate.entityId.toLowerCase() &&
        verified.domain === input.task.domain &&
        verified.seedIds.length === input.seedIds.length &&
        verified.seedIds.every((id) => input.seedIds.some((seed) => seed.toLowerCase() === id.toLowerCase()));
      if (!authentic) unsigned += 1;
      lines.push({
        id: candidate.entityId,
        name: candidate.name,
        affinity: authentic ? verified.affinity : null,
        authenticated: authentic,
        explainability: authentic ? explainText(verified.explainability) : "Unavailable",
      });
    }
    if (unsigned > 0) {
      warnings.push(`${unsigned} candidate score${unsigned === 1 ? "" : "s"} were not treated as provider-authenticated.`);
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
      provenance: { ...result.provenance, evidence: "Allowlisted choices. Numeric affinity was included only for signed evidence." },
    };
  });
}
