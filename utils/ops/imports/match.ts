export type IdentityMatch = {
  externalItemId: string | null;
  skuItemIds: string[];
};
export function resolveImportMatch(input: IdentityMatch): {
  itemId: string | null;
  conflict: string | null;
} {
  const distinctSku = [...new Set(input.skuItemIds)];
  if (distinctSku.length > 1)
    return { itemId: null, conflict: "SKU identifies more than one item" };
  if (
    input.externalItemId &&
    distinctSku[0] &&
    input.externalItemId !== distinctSku[0]
  )
    return {
      itemId: null,
      conflict: "External ID and SKU identify different items",
    };
  return {
    itemId: input.externalItemId ?? distinctSku[0] ?? null,
    conflict: null,
  };
}
