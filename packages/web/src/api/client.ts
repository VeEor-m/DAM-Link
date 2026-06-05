// Thin fetch wrapper. Same-origin in dev (Vite proxy), CORS in prod.
const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  // Override Content-Type for multipart
  contentType?: string;
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include', // send session cookie
    headers: {
      ...(opts.body && !(opts.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(opts.contentType ? { 'content-type': opts.contentType } : {}),
    },
    body:
      opts.body == null
        ? undefined
        : opts.body instanceof FormData
        ? opts.body
        : JSON.stringify(opts.body),
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? `Request failed: ${res.status}`,
      json?.error?.details,
    );
  }
  return (json?.data ?? json) as T;
}
