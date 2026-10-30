import { handleRoute } from "@/lib/http/route";
import { discoverCandidates } from "@/lib/providers/qloo";
import { discoverRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleRoute(request, "qloo.discover", async (body, ctx) => {
    const input = discoverRequestSchema.parse(body);
    const result = await discoverCandidates({ ...input, signal: ctx.signal });
    const warnings = [...result.warnings];
    if (input.domain === "book") {
      warnings.push("Affinity reflects explicit interests. Location was not applied to Qloo scoring.");
    }
    if (input.domain === "place" && input.locationQuery && !result.locality) {
      warnings.push("No locality resolution was returned for this city filter.");
    }
    return {
      data: {
        entities: result.entities.map((entity) => ({
          entityId: entity.entityId,
          name: entity.name,
          types: entity.types,
        })),
        geographicSignalApplied: result.geographicSignalApplied,
        locality: result.locality,
      },
      warnings,
      provenance: { provider: "qloo", ...result.call, geographicSignalApplied: result.geographicSignalApplied },
    };
  });
}
