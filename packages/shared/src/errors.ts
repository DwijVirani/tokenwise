import { z } from "zod";

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "PROVIDER_ERROR",
  "INTERNAL",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    retryAfterSeconds: z.number().int().positive().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  PROVIDER_ERROR: 502,
  INTERNAL: 500,
};

export function apiError(
  code: ErrorCode,
  message: string,
  extra: { retryAfterSeconds?: number; details?: unknown } = {},
): ApiError {
  return { error: { code, message, ...extra } };
}
