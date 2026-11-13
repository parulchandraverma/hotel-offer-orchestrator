export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, 'VALIDATION_ERROR', 'Invalid request parameters', details);
  }
}

export class UpstreamUnavailableError extends AppError {
  constructor(message = 'All hotel suppliers are currently unavailable', details?: unknown) {
    super(502, 'SUPPLIERS_UNAVAILABLE', message, details);
  }
}

export class ServiceBusyError extends AppError {
  constructor(message = 'Offers are being refreshed, please retry shortly') {
    super(503, 'SERVICE_BUSY', message);
  }
}
