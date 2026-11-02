import { firebaseAuth } from "../firebase.ts";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export interface ApiErrorDetails {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    { status, code = "request_failed", details = {} }: ApiErrorDetails = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
}

interface ErrorPayload {
  error?: { message?: string; code?: string; details?: Record<string, unknown> };
}

/**
 * The single entry point for every call to the platform API. It attaches the
 * current Firebase ID token, and retries a 401 exactly once with a force-
 * refreshed token — an expired token is the common case and is not worth
 * surfacing to the user.
 *
 * There used to be three thin wrappers around this (api.js, auth/api.js,
 * platform/api.js); they added an error subclass that behaved identically and
 * nothing else.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
  forceRefresh = false,
): Promise<T> {
  await firebaseAuth.authStateReady();
  const token = firebaseAuth.currentUser
    ? await firebaseAuth.currentUser.getIdToken(forceRefresh)
    : null;

  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const isFormData = options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined
      ? { body: isFormData ? (options.body as FormData) : JSON.stringify(options.body) }
      : {}),
  });

  if (response.status === 401 && token && !forceRefresh) return apiRequest<T>(path, options, true);

  const payload = (await response.json().catch(() => null)) as (T & ErrorPayload) | null;

  if (!response.ok)
    throw new ApiError(
      validationMessage(payload?.error?.details) ??
        payload?.error?.message ??
        fallbackMessage(response.status),
      {
        status: response.status,
        code: payload?.error?.code,
        details: payload?.error?.details,
      },
    );

  return payload as T;
}

/* For answers without our error body: a route the API doesn't have yet, or a
   proxy/server failure. */
function fallbackMessage(status: number): string {
  if (status === 404) return "This isn't available yet.";
  if (status >= 500) return "Something went wrong on our side. Try again in a moment.";
  return `Request failed (${status}).`;
}

/* A 422 lists the rejected fields in details.issues.properties (zod's tree of
   errors). Naming them beats a bare "Request validation failed." */
function validationMessage(details: Record<string, unknown> | undefined): string | null {
  const issues = details?.issues as { properties?: Record<string, unknown> } | undefined;
  const fields = Object.keys(issues?.properties ?? {}).map((field) => field.replaceAll("_", " "));
  return fields.length ? `Please check: ${fields.join(", ")}.` : null;
}

/**
 * A 403 means the member lacks the permission, and a "resource_not_found" 404
 * means the record is gone: both are an empty section, not an error. Any other
 * 404 means the API doesn't offer this yet, which the page must show as such.
 */
export async function apiRequestOptional<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiRequest<T>(path);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401 || error.status === 403) return fallback;
    if (error.status === 404 && error.code === "resource_not_found") return fallback;
    throw error;
  }
}
