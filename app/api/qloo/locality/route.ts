import { chooseMatch } from "@/lib/audit/match";
import { handleRoute } from "@/lib/http/route";
import { searchLocalities } from "@/lib/providers/qloo";
import { localityRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleRoute(request, "qloo.locality", async (body, ctx) => {
    const input = localityRequestSchema.parse(body);
    const result = await searchLocalities({ name: input.name, signal: ctx.signal });
    const candidates = result.entities.map((entity) => ({
      entityId: entity.entityId,
      name: entity.name,
      types: entity.types.length > 0 ? entity.types : ["urn:entity:locality"],
    }));
    const decision = chooseMatch(input.name, candidates, ["urn:entity:locality"]);
    return {
      data: {
        candidates,
        match: {
          status: candidates.length === 0 ? "unmatched" : decision.status,
          ambiguous: decision.ambiguous || candidates.length > 1,
          entity: decision.entity,
        },
      },
      warnings: result.warnings,
      provenance: { provider: "qloo", ...result.call },
    };
  });
}
