export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (message = "Authentication is required.") =>
  new AppError("AUTHENTICATION_REQUIRED", message, 401);
export const forbidden = (permission?: string) =>
  new AppError(
    "PERMISSION_DENIED",
    "You do not have permission to perform this action.",
    403,
    permission ? { permission } : {},
  );
export const notFound = (resource: string) =>
  new AppError("RESOURCE_NOT_FOUND", `${resource} was not found.`, 404, {
    resource,
  });
export const conflict = (code: string, message: string) =>
  new AppError(code, message, 409);
