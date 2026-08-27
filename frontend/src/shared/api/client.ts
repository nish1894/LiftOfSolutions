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
    throw new ApiError(payload?.error?.message ?? `Request failed (${response.status}).`, {
      status: response.status,
      code: payload?.error?.code,
      details: payload?.error?.details,
    });

  return payload as T;
}

/**
 * Some endpoints legitimately 403 or 404 for a member without the matching
 * permission. That is an empty section, not an error worth showing.
 */
export async function apiRequestOptional<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiRequest<T>(path);
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) return fallback;
    throw error;
  }
}
