import type { VintedClient } from "./client";
import type { OntologySnapshot } from "./ontology";
import { assertOntologyVersion } from "./ontology";

export type VintedItemInput = {
  item_reference: string;
  title: string;
  description: string;
  photo_urls: string[];
  currency: string;
  price: number;
  catalog_id: number;
  brand: string;
  package_size_id: number;
  item_attributes: Array<{ id: string; option_ids: number[] }>;
  size_id?: number;
  color_ids?: number[];
};

export function validateItemInput(
  item: VintedItemInput,
  approvedVersion: string,
  ontology: OntologySnapshot,
): void {
  assertOntologyVersion(approvedVersion, ontology);
  if (!item.item_reference || item.item_reference.length > 64)
    throw new Error("Vinted item reference is invalid");
  if (item.title.length < 5 || item.title.length > 100)
    throw new Error("Vinted title must contain 5 to 100 characters");
  if (item.description.length < 5 || item.description.length > 2000)
    throw new Error("Vinted description must contain 5 to 2000 characters");
  if (
    !item.photo_urls.length ||
    item.photo_urls.some((url) => !url.startsWith("https://"))
  )
    throw new Error("Vinted requires accessible HTTPS photos");
  if (!Number.isFinite(item.price) || item.price < 1)
    throw new Error("Vinted price must be at least 1");
  if (
    !Number.isSafeInteger(item.catalog_id) ||
    !Number.isSafeInteger(item.package_size_id)
  )
    throw new Error("Vinted catalog or package size is invalid");
  if (!item.brand.trim() || !item.currency)
    throw new Error("Vinted required fields missing");
  const enumerations = ontology.payload.enumerations as Record<string, unknown>;
  for (const [key, id] of [
    ["catalogs", item.catalog_id],
    ["package_sizes", item.package_size_id],
  ] as const) {
    const values = enumerations[key];
    if (
      !Array.isArray(values) ||
      !values.some(
        (value) =>
          value &&
          typeof value === "object" &&
          (value as { id?: unknown }).id === id,
      )
    )
      throw new Error(`Vinted ${key} ID is not in approved ontology`);
  }
}

export async function createItems(
  client: VintedClient,
  items: VintedItemInput[],
  approvedVersion: string,
  ontology: OntologySnapshot,
  slots: { active: number; limit: number },
): Promise<Array<{ item_id: string; item_reference: string }>> {
  if (!items.length || items.length > 100)
    throw new Error("Vinted batch must contain 1 to 100 items");
  if (slots.active + items.length > slots.limit)
    throw new Error("Vinted account has insufficient active item slots");
  for (const item of items) validateItemInput(item, approvedVersion, ontology);
  const result = await client.request("POST", "/api/v1/items", { items });
  if (result.status !== 202)
    throw new Error(`Vinted create request failed (${result.status})`);
  const received = (
    result.data as {
      items?: Array<{ item_id: string; item_reference: string }>;
    }
  ).items;
  if (!Array.isArray(received) || received.length !== items.length)
    throw new Error("Vinted create acknowledgement is incomplete");
  return received;
}

export async function getItemStatus(
  client: VintedClient,
  id: string,
): Promise<unknown> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid Vinted UUID");
  const response = await client.request("GET", `/api/v1/items/${id}/status`);
  if (response.status !== 200)
    throw new Error(`Vinted item status unavailable (${response.status})`);
  return response.data;
}

export async function findByReference(
  client: VintedClient,
  reference: string,
): Promise<unknown[]> {
  const matches: unknown[] = [];
  let after: string | null = null;
  for (let page = 0; page < 1000; page += 1) {
    const path: string = `/api/v1/items?limit=250${after ? `&after_item_id=${after}` : ""}`;
    const response = await client.request("GET", path);
    if (response.status !== 200)
      throw new Error(`Vinted items unavailable (${response.status})`);
    const items = (
      response.data as {
        items?: Array<{ item_reference?: unknown; item_id?: unknown }>;
      }
    ).items;
    if (!Array.isArray(items))
      throw new Error("Vinted items response is incomplete");
    matches.push(...items.filter((item) => item.item_reference === reference));
    if (items.length < 250) return matches;
    const lastId = items.at(-1)?.item_id;
    if (typeof lastId !== "string" || lastId === after)
      throw new Error("Vinted item page cursor is invalid");
    after = lastId;
  }
  throw new Error("Vinted item reconciliation exceeded page limit");
}
