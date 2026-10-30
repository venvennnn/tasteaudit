import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, logProviderFailure, toApiError } from "@/lib/providers/errors";
import { redactSecrets } from "@/lib/security/redact";

export const NO_STORE = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export function jsonData<T>(data: T, warnings: string[], provenance: Record<string, unknown>, status = 200) {
  return NextResponse.json({ data, warnings, provenance }, { status, headers: NO_STORE });
}

export function jsonError(error: AppError) {
  return NextResponse.json(
    {
      code: error.code,
      message: redactSecrets(error.message),
      stage: error.stage,
      retryable: error.retryable,
      requestId: error.requestId,
    },
    { status: error.status === 499 ? 499 : error.status, headers: NO_STORE },
  );
}

export async function parseJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 80_000) {
    throw new AppError({
      code: "payload_too_large",
      message: "The request is too large.",
      stage: "request",
      retryable: false,
      status: 413,
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError({
      code: "invalid_request",
      message: "The request body must be JSON.",
      stage: "request",
      retryable: false,
      status: 400,
    });
  }
}

export function assertSameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") {
    throw new AppError({
      code: "forbidden_origin",
      message: "Provider routes accept same-origin browser calls only.",
      stage: "request",
      retryable: false,
      status: 403,
    });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
    if (!originHost || originHost !== host) {
      throw new AppError({
        code: "forbidden_origin",
        message: "Provider routes accept same-origin browser calls only.",
        stage: "request",
        retryable: false,
        status: 403,
      });
    }
  }
}

const hits: number[] = [];

export function assertInstanceCapacity() {
  const limit = Number(process.env.TASTEAUDIT_INSTANCE_RPM ?? 40);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 40;
  const now = Date.now();
  while (hits.length > 0 && hits[0]! < now - 60_000) hits.shift();
  if (hits.length >= cap) {
    throw new AppError({
      code: "throttled",
      message: "This server instance is temporarily limiting new provider requests. This is not a durable global rate limit.",
      stage: "request",
      retryable: true,
      status: 429,
    });
  }
  hits.push(now);
}

export function resetInstanceCapacity() {
  hits.length = 0;
}

export async function handleRoute<T>(
  request: Request,
  stage: string,
  run: (body: unknown, ctx: { requestId: string; signal: AbortSignal }) => Promise<{
    data: T;
    warnings: string[];
    provenance: Record<string, unknown>;
  }>,
) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    assertInstanceCapacity();
    const body = await parseJson(request);
    const result = await run(body, { requestId, signal: request.signal });
    return jsonData(result.data, result.warnings, { ...result.provenance, requestId });
  } catch (error) {
    if (error instanceof ZodError) {
      const wrapped = new AppError({
        code: "invalid_request",
        message: "The request did not match the expected format.",
        stage,
        retryable: false,
        status: 400,
        requestId,
      });
      logProviderFailure({ code: wrapped.code, stage, requestId, status: wrapped.status });
      return jsonError(wrapped);
    }
    const wrapped = toApiError(error, stage, requestId);
    logProviderFailure({ code: wrapped.code, stage: wrapped.stage, requestId, status: wrapped.status });
    return jsonError(wrapped);
  }
}
