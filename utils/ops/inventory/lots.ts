export function allocateMinor(
  totalMinor: number | null,
  itemIds: string[],
  overrides: Record<string, number>,
): Record<string, number | null> {
  const sorted = [...itemIds].sort();
  if (sorted.length === 0 || new Set(sorted).size !== sorted.length)
    throw new Error("Lot items must be unique and nonempty");
  for (const [id, amount] of Object.entries(overrides)) {
    if (!sorted.includes(id) || !Number.isSafeInteger(amount) || amount < 0)
      throw new Error("Invalid cost override");
  }
  if (totalMinor === null) {
    if (Object.keys(overrides).length)
      throw new Error("Cannot allocate an unknown lot cost");
    return Object.fromEntries(sorted.map((id) => [id, null]));
  }
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0)
    throw new Error("Invalid lot cost");
  const fixed = Object.values(overrides).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  if (!Number.isSafeInteger(fixed) || fixed > totalMinor)
    throw new Error("Overrides exceed lot cost");
  const remainingIds = sorted.filter((id) => !(id in overrides));
  const remaining = totalMinor - fixed;
  if (!remainingIds.length && remaining !== 0)
    throw new Error("Lot cost has an unallocated remainder");
  const base = remainingIds.length
    ? Math.floor(remaining / remainingIds.length)
    : 0;
  const extra = remainingIds.length ? remaining % remainingIds.length : 0;
  const allocation: Record<string, number> = {};
  remainingIds.forEach((id, index) => {
    allocation[id] = base + (index < extra ? 1 : 0);
  });
  for (const id of Object.keys(overrides)) allocation[id] = overrides[id];
  return allocation;
}
