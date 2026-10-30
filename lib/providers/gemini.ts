import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";
import { DEFAULT_GEMINI_MODEL, FROZEN_GENERATION, SYSTEM_PROMPT_VERSION } from "@/lib/schemas/limits";
import { AppError } from "@/lib/providers/errors";
import { timeoutSignal } from "@/lib/providers/retry";
import type { TaskSpec } from "@/lib/schemas/api";

export type GeminiProvenance = {
  provider: "gemini";
  model: string;
  requestedModel: string;
  systemPromptVersion: string;
  temperature: number | null;
  topP: number | null;
  latencyMs: number;
  usage: {
    promptTokenCount: number | null;
    candidatesTokenCount: number | null;
    totalTokenCount: number | null;
  };
  retrievedAt: string;
};

export const answerJsonSchema = {
  type: "object",
  properties: {
    answer: { type: "string", description: "The full recommendation text." },
  },
  required: ["answer"],
};

export const extractJsonSchema = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "A recommendation name that appears in the answer." },
          quote: { type: "string", description: "An exact substring of the answer that contains the name." },
        },
        required: ["name", "quote"],
      },
    },
  },
  required: ["picks"],
};

export const repairJsonSchema = {
  type: "object",
  properties: {
    selections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "An entity id copied from the allowlist." },
          reason: { type: "string", description: "A concise reason that does not invent weights or venue facts." },
        },
        required: ["id", "reason"],
      },
    },
    answer: { type: "string", description: "The revised recommendation text naming only the selected items." },
  },
  required: ["selections", "answer"],
};

function requiredModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function samplingFor(model: string): { temperature: number; topP: number } | null {
  if (model.startsWith("gemini-3")) return null;
  return { temperature: FROZEN_GENERATION.temperature, topP: FROZEN_GENERATION.topP };
}

function requiredKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new AppError({
      code: "not_configured",
      message: "GEMINI_API_KEY is not configured.",
      stage: "gemini",
      retryable: false,
      status: 503,
    });
  }
  return key;
}

function geminiTimeout(): number {
  const raw = Number(process.env.GEMINI_TIMEOUT_MS ?? 25_000);
  if (!Number.isFinite(raw) || raw < 1000) return 25_000;
  return Math.min(raw, 50_000);
}

function customerBlock(task: TaskSpec): string {
  const interests = task.interests
    .map((interest) => {
      const resolved = interest.resolvedName ? ` (resolved as ${interest.resolvedName})` : "";
      return `- ${interest.name}${resolved} [${interest.kind}]`;
    })
    .join("\n");
  return [
    `Company label: ${task.companyName || "Unnamed company"}`,
    `Assistant purpose: ${task.assistantPurpose || "Not stated"}`,
    `Domain: ${task.domain === "book" ? "book recommendations" : "place recommendations"}`,
    `City supplied by the customer: ${task.city || "Not stated"}`,
    `Country: ${task.country || "Not stated"}`,
    `Age supplied by the customer: ${task.age ?? "Not stated"}`,
    `Budget: ${task.budget || "Not stated"} ${task.currency}`.trim(),
    `Preferred language: ${task.language || "Not stated"}`,
    `Requirements: ${task.requirements || "None stated"}`,
    "Explicit interests:",
    interests || "- None resolved",
    `Question: ${task.question}`,
    `Recommend this many items: ${task.count}`,
  ].join("\n");
}

export function originalPrompt(task: TaskSpec): string {
  return [
    "Write the answer a simulated assistant would give.",
    "Use only the customer context below. Do not invent taste-database scores, contribution weights, opening hours, stock, or accessibility.",
    "Name the requested number of specific recommendations.",
    customerBlock(task),
  ].join("\n\n");
}

export function refinePrompt(task: TaskSpec, originalAnswer: string): string {
  return [
    "Revise the previous answer using only the same customer context.",
    "Do not use an external taste database, and do not invent scores or venue facts.",
    "This is a self-refinement baseline.",
    customerBlock(task),
    "Previous answer:",
    originalAnswer,
  ].join("\n\n");
}

export function extractPrompt(answer: string, domain: string, count: number): string {
  return [
    `Extract up to ${count} ${domain === "book" ? "books" : "places"} that are actually named in the answer.`,
    "For each one, copy an exact substring of the answer that contains the name.",
    "Do not add recommendations that are not named.",
    "Answer:",
    answer,
  ].join("\n\n");
}

export type GroundingLine = {
  id: string;
  name: string;
  affinity: number | null;
  authenticated: boolean;
  explainability: string;
};

export function repairPrompt(task: TaskSpec, lines: GroundingLine[]): string {
  const evidence = lines
    .map((line) => {
      const score = line.authenticated && line.affinity !== null ? `affinity ${line.affinity}` : "affinity not authenticated for this request";
      return `- id ${line.id} | ${line.name} | ${score} | explainability: ${line.explainability}`;
    })
    .join("\n");
  return [
    "These recommendations were already selected. Write the revised answer for this list only.",
    "Return every supplied id, in the same order. Do not add, drop, or reorder ids.",
    "For each id, write one or two sentences. Use only the supplied affinity and explainability.",
    "Do not invent contribution weights, customer behavior, opening hours, stock, prices, or accessibility.",
    "If a practical fact was not supplied, say it is unverified.",
    "If explainability says Unavailable, do not create weights.",
    customerBlock(task),
    "Selected recommendations:",
    evidence,
  ].join("\n\n");
}

export const SYSTEM_INSTRUCTION = [
  `Prompt version ${SYSTEM_PROMPT_VERSION}.`,
  "You are TasteAudit's controlled writing model.",
  "You are not affiliated with any hotel, bookstore, or other brand named in the scenario.",
  "Return only JSON that matches the requested schema.",
  "Never invent Qloo ids, affinity values, or real-world availability.",
].join(" ");

export async function generateStructured<T>(input: {
  stage: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  parsed: ZodType<T>;
  signal?: AbortSignal;
}): Promise<{ data: T; provenance: GeminiProvenance }> {
  const model = requiredModel();
  const sampling = samplingFor(model);
  const key = requiredKey();
  const client = new GoogleGenAI({ apiKey: key });
  const started = Date.now();
  let attempt = 0;
  let lastError: AppError | null = null;
  while (attempt < 2) {
  const timed = timeoutSignal(geminiTimeout(), input.signal);
  try {
    const response = await client.models.generateContent({
      model,
      contents: input.prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        ...(sampling ?? {}),
        responseMimeType: "application/json",
        responseJsonSchema: input.jsonSchema,
        abortSignal: timed.signal,
      },
    });
    const text = response.text;
    if (!text || !text.trim()) {
      throw new AppError({
        code: "empty_response",
        message: "The model returned an empty response.",
        stage: input.stage,
        retryable: true,
        status: 502,
      });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      throw new AppError({
        code: "invalid_model_output",
        message: "The model did not return valid JSON.",
        stage: input.stage,
        retryable: true,
        status: 502,
      });
    }
    const parsed = input.parsed.safeParse(raw);
    if (!parsed.success) {
      throw new AppError({
        code: "invalid_model_output",
        message: "The model output did not match the required schema.",
        stage: input.stage,
        retryable: true,
        status: 502,
      });
    }
    const reported = response.modelVersion?.trim() || model;
    if (reported !== model && !reported.startsWith(model)) {
      throw new AppError({
        code: "invalid_model",
        message: "The provider used a different model than GEMINI_MODEL. This run will not switch models.",
        stage: input.stage,
        retryable: false,
        status: 502,
      });
    }
    return {
      data: parsed.data,
      provenance: {
        provider: "gemini",
        model: reported,
        requestedModel: model,
        systemPromptVersion: SYSTEM_PROMPT_VERSION,
        temperature: sampling?.temperature ?? null,
        topP: sampling?.topP ?? null,
        latencyMs: Date.now() - started,
        usage: {
          promptTokenCount: response.usageMetadata?.promptTokenCount ?? null,
          candidatesTokenCount: response.usageMetadata?.candidatesTokenCount ?? null,
          totalTokenCount: response.usageMetadata?.totalTokenCount ?? null,
        },
        retrievedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (!error.retryable || attempt === 1) throw error;
      lastError = error;
    } else {
    if (error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message))) {
      if (input.signal?.aborted) {
        throw new AppError({
          code: "aborted",
          message: "The request was cancelled.",
          stage: input.stage,
          retryable: true,
          status: 499,
        });
      }
      lastError = new AppError({
        code: "timeout",
        message: "The model request timed out.",
        stage: input.stage,
        retryable: true,
        status: 504,
      });
      if (attempt === 1) throw lastError;
    } else {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 0;
    if (status === 401 || status === 403) {
      throw new AppError({
        code: "authentication",
        message: "The model provider rejected the API key.",
        stage: input.stage,
        retryable: false,
        status: 401,
      });
    }
    if (status === 404 || status === 400) {
      throw new AppError({
        code: "invalid_model",
        message: "GEMINI_MODEL is not available for this key, or the response schema was rejected.",
        stage: input.stage,
        retryable: false,
        status: 400,
      });
    }
    if (status === 429) {
      lastError = new AppError({
        code: "throttled_upstream",
        message: "The model provider asked us to slow down.",
        stage: input.stage,
        retryable: true,
        status: 429,
      });
      if (attempt === 1) throw lastError;
    } else {
    lastError = new AppError({
      code: "upstream",
      message: "The model request failed.",
      stage: input.stage,
      retryable: true,
      status: 502,
    });
    if (attempt === 1) throw lastError;
    }
    }
    }
  } finally {
    timed.cancel();
  }
  await new Promise((resolve) => setTimeout(resolve, 200 + Math.floor(Math.random() * 100)));
  attempt += 1;
  }
  throw lastError ?? new AppError({
    code: "upstream",
    message: "The model request failed.",
    stage: input.stage,
    retryable: true,
    status: 502,
  });
}
