export class UnimplementedError extends Error {
  readonly statusCode = 501;

  constructor(feature: string) {
    super(`"${feature}" is a scaffold stub and is not implemented yet`);
    this.name = 'UnimplementedError';
  }
}

export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/**
 * Raised when a login is refused for application-policy reasons (domain,
 * provisioning, binding, activation). The message is deliberately generic so
 * responses never reveal whether an email is registered or why it was
 * rejected. Invalid OIDC responses use a separate generic 401 instead.
 */
export class LoginDeniedError extends AppError {
  constructor() {
    super('Login denied.', 403);
    this.name = 'LoginDeniedError';
  }
}
