import {
  getBrowserSession,
  refreshBrowserSession,
  signOutBrowser,
} from "./auth";
import type { MobileApiFetchOptions } from "./types";

export class MobileApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor({
    status,
    code,
    message,
    retryable,
  }: {
    status: number;
    code: string;
    message: string;
    retryable: boolean;
  }) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function getHeaderRecord(
  input: HeadersInit | undefined,
): Record<string, string> {
  if (!input) return {};
  if (input instanceof Headers) return Object.fromEntries(input.entries());
  if (Array.isArray(input)) return Object.fromEntries(input);
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, String(value)]),
  );
}

function isAllowedPath(path: string): boolean {
  return path.startsWith("/api/") || path === "/api";
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorFromResponse(response: Response, body: unknown): MobileApiError {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code =
    typeof record.code === "string" && record.code.trim()
      ? record.code
      : `http_${response.status}`;
  const message =
    typeof record.error === "string" && record.error.trim()
      ? record.error
      : typeof record.message === "string" && record.message.trim()
        ? record.message
        : "The request could not be completed.";
  const retryable =
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500;

  return new MobileApiError({
    status: response.status,
    code,
    message: message.slice(0, 240),
    retryable,
  });
}

function networkError(): MobileApiError {
  return new MobileApiError({
    status: 0,
    code: "network_error",
    message:
      "We could not reach AutoLister. Check your connection and try again.",
    retryable: true,
  });
}

function abortedError(): MobileApiError {
  return new MobileApiError({
    status: 0,
    code: "aborted",
    message: "The request was cancelled.",
    retryable: false,
  });
}

export async function fetchMobileJson<T = unknown>(
  path: string,
  init: RequestInit = {},
  options: MobileApiFetchOptions = {},
): Promise<T> {
  if (!isAllowedPath(path)) {
    throw new MobileApiError({
      status: 0,
      code: "invalid_api_path",
      message: "The request path is not available.",
      retryable: false,
    });
  }

  const retryOn401 = options.retryOn401 !== false;
  let session = await getBrowserSession().catch(() => null);
  let didRefresh = false;

  const request = async () => {
    const headers = getHeaderRecord(init.headers);
    if (session?.access_token)
      headers.Authorization = `Bearer ${session.access_token}`;
    try {
      const response = await fetch(path, { ...init, headers });
      const body = await readJson(response);
      return { response, body };
    } catch (error) {
      if (
        init.signal?.aborted ||
        (error &&
          typeof error === "object" &&
          (error as { name?: unknown }).name === "AbortError")
      ) {
        throw abortedError();
      }
      throw networkError();
    }
  };

  let result = await request();
  if (result.response.status === 401 && retryOn401 && !didRefresh) {
    didRefresh = true;
    try {
      session = await refreshBrowserSession();
    } catch {
      session = null;
    }
    result = await request();
  }

  if (result.response.status === 401 && didRefresh) {
    await signOutBrowser().catch(() => undefined);
  }
  if (!result.response.ok)
    throw errorFromResponse(result.response, result.body);
  return result.body as T;
}
