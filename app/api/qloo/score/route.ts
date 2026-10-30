import { INTEREST_AFFINITY_NOTE } from "@/lib/audit/geography";
import { handleRoute } from "@/lib/http/route";
import { scoreCandidates } from "@/lib/providers/qloo";
import { scoreRequestSchema } from "@/lib/schemas/api";
import { signEvidence, signingAvailable } from "@/lib/security/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleRoute(request, "qloo.score", async (body, ctx) => {
    const input = scoreRequestSchema.parse(body);
    const result = await scoreCandidates({ ...input, signal: ctx.signal });
    const signing = signingAvailable();
    const entities = result.entities
      .filter((entity) => input.candidateIds.some((id) => id.toLowerCase() === entity.entityId.toLowerCase()))
      .map((entity) => ({
        entityId: entity.entityId,
        name: entity.name,
        types: entity.types,
        affinity: entity.affinity,
        explainability: entity.explainability,
        language: entity.language,
        description: entity.description,
        tags: entity.tags,
        evidenceOrigin: signing ? ("provider" as const) : ("unsigned" as const),
        envelope: signEvidence({
          domain: input.domain,
          entityId: entity.entityId,
          name: entity.name,
          affinity: entity.affinity,
          explainability: entity.explainability,
          seedIds: input.seedIds,
        }),
      }));
    const warnings = [...result.warnings];
    if (!signing) warnings.push("Evidence signing is not configured. Numeric scores from this response are not signed.");
    if (input.domain === "book") warnings.push(INTEREST_AFFINITY_NOTE);
    return {
      data: {
        entities,
        missingIds: result.missingIds,
        geographicSignalApplied: result.geographicSignalApplied,
        locality: result.locality,
        signing,
      },
      warnings,
      provenance: { provider: "qloo", ...result.call, evidenceSigning: signing },
    };
  });
}
