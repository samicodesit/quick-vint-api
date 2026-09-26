import type { GatewayRequest, OpsResult } from "../contracts/core";

type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ json(): Promise<unknown> }>;

export async function callOps<T>(
  fetcher: FetchLike,
  token: string,
  request: GatewayRequest,
): Promise<T> {
  if (!token) throw new Error("Your session has expired. Sign in again.");
  const response = await fetcher("/api/ops", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const result = (await response.json()) as OpsResult<T>;
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
