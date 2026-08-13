'use strict';

class AppError extends Error {
  constructor(code, message, status = 500, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function errorBody(err) {
  if (err instanceof AppError) {
    return {
      error: {
        code: err.code,
        message: err.message,
      },
    };
  }

  return {
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred.',
    },
  };
}

function mapUpstreamStatus(status, fallbackMessage) {
  if (status === 401 || status === 403) {
    return new AppError(
      'AUTH_FAILED',
      'Unable to authenticate with Hospilot. Please check server credentials.',
      status
    );
  }
  if (status === 429) {
    return new AppError(
      'RATE_LIMITED',
      'Too many requests. Please wait a moment and try again.',
      429
    );
  }
  if (status >= 500) {
    return new AppError(
      'UPSTREAM_UNAVAILABLE',
      fallbackMessage || 'Hospilot is temporarily unavailable. Please try again.',
      502
    );
  }
  return new AppError(
    'UPSTREAM_ERROR',
    fallbackMessage || 'Hospilot request failed. Please try again.',
    status >= 400 && status < 600 ? status : 502
  );
}

module.exports = { AppError, errorBody, mapUpstreamStatus };
