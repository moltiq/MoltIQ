/**
 * Structured API errors: code, message, statusCode, optional details.
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON(): ApiErrorShape {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}

export function notFound(message: string = "Resource not found", details?: unknown): AppError {
  return new AppError("NOT_FOUND", message, 404, details);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError("BAD_REQUEST", message, 400, details);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError("CONFLICT", message, 409, details);
}

export function internal(message: string = "Internal server error", details?: unknown): AppError {
  return new AppError("INTERNAL_ERROR", message, 500, details);
}
