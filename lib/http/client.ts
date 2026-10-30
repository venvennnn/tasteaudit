export type ApiFailure = { code: string; message: string; retryable: boolean; requestId: string; stage?: string };

export async function postJson<T>(path: string, body: unknown, signal: AbortSignal): Promise<{
  data: T;
  warnings: string[];
  provenance: Record<string, unknown>;
}> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) {
      throw { code: "aborted", message: "The run was cancelled.", retryable: true, requestId: "", stage: path } satisfies ApiFailure;
    }
    throw { code: "upstream", message: "The network request failed.", retryable: true, requestId: "", stage: path } satisfies ApiFailure;
  }
  const payload = (await response.json().catch(() => null)) as
    | { data: T; warnings?: string[]; provenance?: Record<string, unknown>; code?: string; message?: string; retryable?: boolean; requestId?: string; stage?: string }
    | null;
  if (!response.ok || !payload || !("data" in payload)) {
    throw {
      code: payload?.code ?? "upstream",
      message: payload?.message ?? "The request failed.",
      retryable: Boolean(payload?.retryable),
      requestId: payload?.requestId ?? "",
      stage: payload?.stage ?? path,
    } satisfies ApiFailure;
  }
  return { data: payload.data, warnings: payload.warnings ?? [], provenance: payload.provenance ?? {} };
}
