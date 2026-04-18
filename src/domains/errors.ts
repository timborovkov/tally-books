/**
 * Typed errors thrown by domain services. Server actions catch these
 * and translate them into form-field errors / toast messages instead
 * of leaking raw FK violations or 500s to the user.
 */

export class DomainError extends Error {
  readonly code: string;
  readonly meta: Record<string, unknown>;

  constructor(code: string, message: string, meta: Record<string, unknown> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.meta = meta;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super("not_found", `${resource} not found: ${id}`, { resource, id });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, meta: Record<string, unknown> = {}) {
    super("conflict", message, meta);
    this.name = "ConflictError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, meta: Record<string, unknown> = {}) {
    super("validation", message, meta);
    this.name = "ValidationError";
  }
}
