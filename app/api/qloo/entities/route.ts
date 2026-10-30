import { handleRoute } from "@/lib/http/route";
import { getEntityDetails } from "@/lib/providers/qloo";
import { entitiesRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleRoute(request, "qloo.entities", async (body, ctx) => {
    const input = entitiesRequestSchema.parse(body);
    const result = await getEntityDetails({ entityIds: input.entityIds, signal: ctx.signal });
    return {
      data: {
        entities: result.entities.map((entity) => ({
          entityId: entity.entityId,
          name: entity.name,
          types: entity.types,
          language: entity.language,
          description: entity.description,
          tags: entity.tags,
        })),
      },
      warnings: [
        ...result.warnings,
        "Metadata does not prove current hours, stock, price, or accessibility.",
      ],
      provenance: { provider: "qloo", ...result.call },
    };
  });
}
