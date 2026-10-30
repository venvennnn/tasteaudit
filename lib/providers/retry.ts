import { AppError, statusForUpstream } from "@/lib/providers/errors";

export type RetryOptions = {
  retries?: number;
  stage: string;
  signal?: AbortSignal;
  minDelayMs?: number;
  softStatuses?: number[];
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 8000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 8000);
  return null;
}

export async function fetchWithRetry(url: string, init: RequestInit, options: RetryOptions): Promise<Response> {
  const retries = options.retries ?? 2;
  const minDelay = options.minDelayMs ?? 0;
  let attempt = 0;
  let lastError: AppError | null = null;

  while (attempt <= retries) {
    if (options.signal?.aborted) {
      throw new AppError({
        code: "aborted",
        message: "The request was cancelled.",
        stage: options.stage,
        retryable: true,
        status: 499,
      });
    }
    try {
      const response = await fetch(url, { ...init, signal: options.signal });
      if (response.ok || options.softStatuses?.includes(response.status)) return response;
      const mapped = statusForUpstream(response.status);
      const error = new AppError({
        code: mapped.code,
        message: mapped.message,
        stage: options.stage,
        retryable: mapped.retryable,
        status: response.status,
      });
      if (!mapped.retryable || attempt === retries) throw error;
      const honored = retryAfterMs(response.headers.get("retry-after"));
      const backoff = honored ?? Math.min(2000, 250 * 2 ** attempt) + Math.floor(Math.random() * 100);
      await sleep(Math.max(minDelay, backoff), options.signal);
      attempt += 1;
      lastError = error;
      continue;
    } catch (error) {
      if (error instanceof AppError) {
        if (!error.retryable || attempt === retries) throw error;
        lastError = error;
      } else if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        const reason = options.signal?.reason;
        const timedOut = reason instanceof Error && reason.name === "TimeoutError";
        throw new AppError({
          code: timedOut ? "timeout" : "aborted",
          message: timedOut ? "The provider timed out." : "The request was cancelled.",
          stage: options.stage,
          retryable: true,
          status: timedOut ? 504 : 499,
        });
      } else if (attempt === retries) {
        throw new AppError({
          code: "upstream",
          message: "The provider request failed.",
          stage: options.stage,
          retryable: true,
          status: 502,
        });
      }
      const backoff = Math.min(2000, 250 * 2 ** attempt) + Math.floor(Math.random() * 100);
      await sleep(Math.max(minDelay, backoff), options.signal);
      attempt += 1;
    }
  }
  throw (
    lastError ??
    new AppError({
      code: "upstream",
      message: "The provider request failed.",
      stage: options.stage,
      retryable: true,
      status: 502,
    })
  );
}

export function timeoutSignal(ms: number, parent?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const error = new Error("timeout");
    error.name = "TimeoutError";
    controller.abort(error);
  }, ms);
  const onParent = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParent, { once: true });
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParent);
    },
  };
}
