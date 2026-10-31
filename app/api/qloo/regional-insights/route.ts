import { handleRoute } from "@/lib/http/route";
import { regionalInsights } from "@/lib/providers/qloo";
import { regionalInsightsRequestSchema } from "@/lib/schemas/api";
import { signEvidence, signingAvailable } from "@/lib/security/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleRoute(request, "qloo.regional", async (body, ctx) => {
    const input = regionalInsightsRequestSchema.parse(body);
    const result = await regionalInsights({ ...input, signal: ctx.signal });
    const signing = signingAvailable();
    const warnings = [...result.warnings];
    if (input.domain === "book") warnings.push("No location parameter was sent on this book request.");
    return {
      data: {
        entities: result.entities.map((entity) => ({
          entityId: entity.entityId,
          name: entity.name,
          types: entity.types,
          affinity: entity.affinity,
          explainability: entity.explainability,
          language: entity.language,
          tags: entity.tags,
          evidenceOrigin: signing ? ("provider" as const) : ("unsigned" as const),
          envelope: signEvidence({
            domain: input.domain,
            entityId: entity.entityId,
            name: entity.name,
            affinity: entity.affinity,
            explainability: entity.explainability,
            seedIds: input.seedIds ?? [],
          }),
        })),
        missingIds: result.missingIds,
        locality: result.locality,
        parameters: Object.entries(result.parameters).map(([name, value]) => ({ name, value })),
      },
      warnings,
      provenance: { provider: "qloo", ...result.call, evidenceSigning: signing },
    };
  });
}
