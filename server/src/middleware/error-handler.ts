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
  const isDev = process.env.NODE_ENV === 'development';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        ...(isDev && { stack: err.stack }),
      },
    });
    return;
  }

  // Unexpected errors — log the full error, return a safe message.
  console.error('[unhandled error]', err);

  res.status(500).json({
    error: {
      message: 'An unexpected error occurred. Please try again.',
      ...(isDev && { detail: err.message, stack: err.stack }),
    },
  });
}
