export type ErrorCode =
  | "invalid_request"
  | "forbidden_origin"
  | "throttled"
  | "not_configured"
  | "authentication"
  | "forbidden"
  | "invalid_model"
  | "timeout"
  | "throttled_upstream"
  | "upstream"
  | "empty_response"
  | "invalid_model_output"
  | "payload_too_large"
  | "aborted";

export type ApiErrorBody = {
  code: ErrorCode;
  message: string;
  stage: string;
  retryable: boolean;
  requestId: string;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly stage: string;
  readonly retryable: boolean;
  readonly status: number;
  readonly requestId: string;

  constructor(input: {
    code: ErrorCode;
    message: string;
    stage: string;
    retryable: boolean;
    status: number;
    requestId?: string;
  }) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.stage = input.stage;
    this.retryable = input.retryable;
    this.status = input.status;
    this.requestId = input.requestId ?? "";
  }
}

export function toApiError(error: unknown, stage: string, requestId: string): AppError {
  if (error instanceof AppError) {
    return new AppError({
      code: error.code,
      message: error.message,
      stage: error.stage || stage,
      retryable: error.retryable,
      status: error.status,
      requestId: error.requestId || requestId,
    });
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new AppError({
      code: "aborted",
      message: "The request was cancelled.",
      stage,
      retryable: true,
      status: 499,
      requestId,
    });
  }
  if (error instanceof Error && error.name === "ZodError") {
    return new AppError({
      code: "invalid_request",
      message: "The request did not match the expected format.",
      stage,
      retryable: false,
      status: 400,
      requestId,
    });
  }
  return new AppError({
    code: "upstream",
    message: "The request could not be completed.",
    stage,
    retryable: true,
    status: 502,
    requestId,
  });
}

export function statusForUpstream(status: number): { code: ErrorCode; retryable: boolean; message: string } {
  if (status === 401) {
    return { code: "authentication", retryable: false, message: "The provider rejected the API key." };
  }
  if (status === 403) {
    return {
      code: "forbidden",
      retryable: false,
      message: "The provider refused this request. The account may not allow this entity type or parameter.",
    };
  }
  if (status === 400) {
    return { code: "invalid_request", retryable: false, message: "The provider rejected the request as invalid." };
  }
  if (status === 404) {
    return { code: "empty_response", retryable: false, message: "The provider returned no results." };
  }
  if (status === 408 || status === 504) {
    return { code: "timeout", retryable: true, message: "The provider timed out." };
  }
  if (status === 429) {
    return { code: "throttled_upstream", retryable: true, message: "The provider asked us to slow down." };
  }
  if (status >= 500) {
    return { code: "upstream", retryable: true, message: "The provider request failed." };
  }
  return { code: "upstream", retryable: false, message: "The provider request failed." };
}

export function logProviderFailure(info: { code: string; stage: string; requestId: string; status?: number }) {
  console.error(
    JSON.stringify({
      scope: "tasteaudit",
      code: info.code,
      stage: info.stage,
      requestId: info.requestId,
      status: info.status ?? null,
    }),
  );
}
