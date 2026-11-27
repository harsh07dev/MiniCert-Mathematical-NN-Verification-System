/**
 * Centralized HTTP API client configured via VITE_API_BASE_URL.
 * Supports typed JSON parsing, structured error extraction, and request cancellation.
 */

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL: string = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, '') : '';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    const target = API_BASE_URL || 'local Vite proxy (/api)';
    throw new ApiError(
      0,
      `Unable to reach the MiniCert FastAPI backend at ${target}. Ensure uvicorn is running.`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    if (isJson) {
      try {
        const parsed = (await response.json()) as {
          detail?: unknown;
          startup_error?: string;
        };
        if (typeof parsed.detail === 'string') {
          detail = parsed.detail;
        } else if (Array.isArray(parsed.detail)) {
          detail = parsed.detail
            .map((entry: { msg?: string }) => entry?.msg ?? JSON.stringify(entry))
            .join('; ');
        } else if (typeof parsed.startup_error === 'string' && parsed.startup_error) {
          detail = parsed.startup_error;
        }
      } catch {
        // Ignore parse fallback
      }
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}
