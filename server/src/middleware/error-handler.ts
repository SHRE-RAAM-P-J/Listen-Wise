import { Request, Response, NextFunction } from 'express';

/**
 * Application-level error with an HTTP status code.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export type ApiFailureType = 'temporary' | 'permanent' | 'source' | 'request';

export function classifyApiFailure(code?: string, statusCode = 500): { failureType: ApiFailureType; retryable: boolean } {
  const temporaryCodes = new Set([
    'AI_TIMEOUT', 'GEMINI_RATE_LIMITED', 'GEMINI_SERVICE_UNAVAILABLE', 'GEMINI_NETWORK_ERROR',
    'FETCH_TIMEOUT', 'NETWORK_ERROR', 'WEBSITE_TEMPORARILY_UNAVAILABLE', 'TTS_TIMEOUT',
    'RATE_LIMIT_EXCEEDED', 'TTS_SERVICE_ERROR', 'TTS_NETWORK_ERROR',
  ]);
  const permanentProviderCodes = new Set([
    'INVALID_API_KEY', 'GEMINI_PERMISSION_DENIED', 'GEMINI_MODEL_UNAVAILABLE', 'GEMINI_QUOTA_EXHAUSTED',
    'INVALID_GEMINI_REQUEST', 'MISSING_GEMINI_API_KEY', 'AI_PROVIDER_NOT_CONFIGURED',
    'INVALID_GNANI_KEY', 'MISSING_GNANI_API_KEY', 'INSUFFICIENT_CREDITS', 'TTS_REQUEST_REJECTED',
  ]);
  if (code && temporaryCodes.has(code)) return { failureType: 'temporary', retryable: true };
  if (statusCode >= 500 && !code) return { failureType: 'temporary', retryable: true };
  if (code && permanentProviderCodes.has(code)) return { failureType: 'permanent', retryable: false };
  if (code?.startsWith('SOURCE_') || code?.startsWith('PDF_') || code === 'UNSUPPORTED_FILE_TYPE') {
    return { failureType: 'source', retryable: false };
  }
  return { failureType: 'request', retryable: false };
}

/**
 * Central error-handling middleware.
 * Catches all errors and returns a consistent JSON response.
 * Never exposes stack traces or internal details in production.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err.name === 'MulterError') {
    const uploadError = err as Error & { code?: string };
    if (uploadError.code === 'LIMIT_FILE_SIZE') {
      const classification = classifyApiFailure('PDF_FILE_TOO_LARGE', 413);
      res.status(413).json({ error: {
        message: 'This PDF exceeds the upload size limit. Compress it or split it into smaller files and upload again.',
        code: 'PDF_FILE_TOO_LARGE',
        ...classification,
      } });
      return;
    }
  }

  if (err instanceof AppError) {
    const classification = classifyApiFailure(err.code, err.statusCode);
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        ...classification,
      },
    });
    return;
  }

  // Unexpected errors — log the full error, return a safe message.
  console.error('[unhandled error]', err.name);

  res.status(500).json({
    error: {
      message: 'An unexpected error occurred. Please try again.',
      failureType: 'temporary',
      retryable: true,
    },
  });
}
