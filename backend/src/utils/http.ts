import type { NextFunction, Request, Response } from "express";
import { ApiError, type ApiErrorCode, normalizeError } from "./errors.js";

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function handleError(error: unknown, res: Response): void {
  const normalized = normalizeError(error);
  const requestId = typeof res.locals?.requestId === "string" ? res.locals.requestId : undefined;
  const body = {
    message: normalized.message,
    code: normalized.code,
    ...(normalized.details ? { details: normalized.details } : {}),
    ...(requestId ? { requestId } : {})
  };
  res.status(normalized.statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): void {
  const requestId = typeof res.locals?.requestId === "string" ? res.locals.requestId : undefined;
  res.status(statusCode).json({
    message,
    code,
    ...(details ? { details } : {}),
    ...(requestId ? { requestId } : {})
  });
}

export function fail(
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): never {
  throw new ApiError({
    statusCode,
    code,
    message,
    details
  });
}

export function singleValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}
