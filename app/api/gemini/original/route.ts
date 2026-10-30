import { z } from "zod";
import { handleRoute } from "@/lib/http/route";
import { answerJsonSchema, generateStructured, originalPrompt } from "@/lib/providers/gemini";
import { originalRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const answerSchema = z.object({ answer: z.string().min(1) });

export function POST(request: Request) {
  return handleRoute(request, "gemini.original", async (body, ctx) => {
    const input = originalRequestSchema.parse(body);
    const result = await generateStructured({
      stage: "gemini.original",
      prompt: originalPrompt(input.task),
      jsonSchema: answerJsonSchema,
      parsed: answerSchema,
      signal: ctx.signal,
    });
    return { data: result.data, warnings: [], provenance: result.provenance };
  });
}
