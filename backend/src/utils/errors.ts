import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UPSTREAM_UNAVAILABLE"
  | "GMAIL_NOT_CONFIGURED"
  | "GMAIL_NOT_CONNECTED"
  | "GMAIL_AUTH_EXPIRED"
  | "EMAIL_SEND_FAILED"
  | "EMAIL_METADATA_SAVE_FAILED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  statusCode: number;
  code: ApiErrorCode;
  details?: Record<string, unknown> | undefined;

  constructor(params: {
    statusCode: number;
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
  }
}

export type ErrorEnvelope = {
  message: string;
  code: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Chyba validace vstupu.",
      details: {
        issues: error.flatten()
      }
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new ApiError({
        statusCode: 409,
        code: "CONFLICT",
        message: "Záznam s touto hodnotou už existuje."
      });
    }

    if (error.code === "P2003") {
      return new ApiError({
        statusCode: 409,
        code: "CONFLICT",
        message: "Záznam nelze smazat, protože je navázán na další data."
      });
    }

    if (error.code === "P2025") {
      return new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Požadovaný záznam nebyl nalezen."
      });
    }
  }

  if (error instanceof Error) {
    return new ApiError({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Došlo k neočekávané chybě."
    });
  }

  return new ApiError({
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Došlo k neočekávané chybě."
  });
}
