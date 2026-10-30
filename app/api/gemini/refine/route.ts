import { z } from "zod";
import { handleRoute } from "@/lib/http/route";
import { answerJsonSchema, generateStructured, refinePrompt } from "@/lib/providers/gemini";
import { refineRequestSchema } from "@/lib/schemas/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const answerSchema = z.object({ answer: z.string().min(1) });

export function POST(request: Request) {
  return handleRoute(request, "gemini.refine", async (body, ctx) => {
    const input = refineRequestSchema.parse(body);
    const result = await generateStructured({
      stage: "gemini.refine",
      prompt: refinePrompt(input.task, input.originalAnswer),
      jsonSchema: answerJsonSchema,
      parsed: answerSchema,
      signal: ctx.signal,
    });
    return {
      data: result.data,
      warnings: ["Self-refinement did not receive Qloo evidence."],
      provenance: result.provenance,
    };
  });
}
