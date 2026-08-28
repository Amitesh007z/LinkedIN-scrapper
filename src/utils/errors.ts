export type ErrorCode =
  | 'INVALID_PROFILE_URL'
  | 'PROFILE_NOT_FOUND'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHENTICATION_CHALLENGE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'EXTRACTION_FAILED'
  | 'SCRAPER_BUSY'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, string | boolean>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.name === 'InvalidProfileUrlError') {
    return new AppError('INVALID_PROFILE_URL', error.message, 400);
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new AppError('UPSTREAM_TIMEOUT', 'LinkedIn did not respond before the timeout.', 502);
  }
  return new AppError('INTERNAL_ERROR', 'An unexpected internal error occurred.', 500);
}
