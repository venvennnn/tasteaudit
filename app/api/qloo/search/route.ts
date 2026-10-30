import { chooseMatch } from "@/lib/audit/match";
import { handleRoute } from "@/lib/http/route";
import { searchEntities } from "@/lib/providers/qloo";
import { searchRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleRoute(request, "qloo.search", async (body, ctx) => {
    const input = searchRequestSchema.parse(body);
    const result = await searchEntities({ name: input.name, expectedTypes: input.expectedTypes, signal: ctx.signal });
    const candidates = result.entities.map((entity) => ({
      entityId: entity.entityId,
      name: entity.name,
      types: entity.types,
      popularity: entity.popularity,
    }));
    const decision = chooseMatch(input.name, candidates, input.expectedTypes);
    return {
      data: {
        candidates,
        match: {
          status: decision.status,
          ambiguous: decision.ambiguous,
          entity: decision.entity,
        },
      },
      warnings: result.warnings,
      provenance: { provider: "qloo", ...result.call },
    };
  });
}
