// StorageApiError.status is HTTP. statusCode can instead be a provider code.
export function classifyPhoneStorageError(error: any) {
  const numeric = (value: unknown) =>
    /^\d{3}$/.test(String(value ?? "")) ? Number(value) : 0;
  const status = numeric(error?.status) || numeric(error?.statusCode);
  const code = String(
    error?.code ||
      (!numeric(error?.statusCode) && error?.statusCode) ||
      "PHONE_STORAGE_ERROR",
  );
  const message = String(error?.message || "");
  const missing =
    [0, 400, 404].includes(status) &&
    (code === "NoSuchKey" ||
      code === "not_found" ||
      (numeric(error?.statusCode) === 404 &&
        /^(Object not found|The resource was not found)\.?$/i.test(message)));
  const conflict =
    code === "ResourceAlreadyExists" ||
    code === "KeyAlreadyExists" ||
    code === "Duplicate" ||
    ([400, 409].includes(status) &&
      /^(The resource already exists|Already exists|Duplicate)\.?$/i.test(
        message,
      ));
  const network =
    error?.name === "StorageUnknownError" ||
    error?.name === "AbortError" ||
    (error instanceof TypeError && /fetch|network/i.test(message)) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND/.test(String(error?.code));
  const retryable =
    !error?.internal &&
    (network || status === 408 || status === 429 || status >= 500);
  return { missing, conflict, code, retryable, status: retryable ? 503 : 500 };
}

export function invalidPhoneMarker(message: string) {
  return Object.assign(new Error(message), {
    code: "PHONE_MARKER_INVALID",
    internal: true,
  });
}
