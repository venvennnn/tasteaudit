import { AUDIENCE_NOT_SENT, DIRECT_REGIONAL_REASON } from "@/lib/audit/capabilities";
import { handleRoute } from "@/lib/http/route";
import { analyzeRegionalTaste } from "@/lib/providers/qloo";
import { tasteRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleRoute(request, "qloo.taste", async (body, ctx) => {
    const input = tasteRequestSchema.parse(body);
    const result = await analyzeRegionalTaste({ ...input, signal: ctx.signal });
    const warnings = [...result.warnings, DIRECT_REGIONAL_REASON, AUDIENCE_NOT_SENT];
    if (input.ageBand && !result.demographicEchoed) {
      warnings.push("An age band was sent. The response did not confirm it was applied.");
    }
    return {
      data: {
        tags: result.tags.map((tag) => ({
          tagId: tag.tagId,
          name: tag.name,
          namespace: tag.namespace,
          types: tag.types,
          score: tag.score,
          compatible: tag.compatible,
          explainabilityStatus: tag.explainability.status,
        })),
        locality: result.locality,
        scoresNumeric: result.scoresNumeric,
        explainabilityReturned: result.explainabilityReturned,
        demographicEchoed: result.demographicEchoed,
        parameters: Object.entries(result.call.parameters).map(([name, value]) => ({ name, value })),
      },
      warnings,
      provenance: { provider: "qloo", ...result.call },
    };
  });
}
