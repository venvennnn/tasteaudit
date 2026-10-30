import { z } from "zod";
import { validateQuotes } from "@/lib/audit/quotes";
import { handleRoute } from "@/lib/http/route";
import { extractJsonSchema, extractPrompt, generateStructured } from "@/lib/providers/gemini";
import { extractRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const extractSchema = z.object({
  picks: z.array(z.object({ name: z.string(), quote: z.string() })),
});

export function POST(request: Request) {
  return handleRoute(request, "gemini.extract", async (body, ctx) => {
    const input = extractRequestSchema.parse(body);
    const result = await generateStructured({
      stage: "gemini.extract",
      prompt: extractPrompt(input.answer, input.domain, input.count),
      jsonSchema: extractJsonSchema,
      parsed: extractSchema,
      signal: ctx.signal,
    });
    const validated = validateQuotes(input.answer, result.data.picks, input.count);
    return { data: { picks: validated.accepted }, warnings: validated.warnings, provenance: result.provenance };
  });
}
