import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callOps } from "./gateway";

type Item = {
  id: string;
  display_sku: string;
  custody: string;
  preparation: string;
  version: number;
  cost_minor?: number | null;
  cost_currency?: string | null;
  ops_item_identifiers?: Array<{ kind: string; value: string }>;
};
type Lot = { lotId: string; version: number };

function euroMinor(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed))
    throw new Error("Enter a valid EUR amount with at most two decimals");
  const [euros, cents = ""] = trimmed.split(".");
  const amount = Number(euros) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("Amount is too large");
  return amount;
}

function LotView({
  client,
  workspaceId,
  lotId,
  role,
}: {
  client: SupabaseClient;
  workspaceId: string;
  lotId: string;
  role: string;
}) {
  const [lot, setLot] = useState<{
    id: string;
    name: string;
    version: number;
    total_cost_minor?: number | null;
    currency?: string | null;
    items: Item[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<string | null>(null);
  async function call<T>(
    kind: "query" | "command",
    name: string,
    payload: object,
    version: number | null = null,
  ) {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (kind === "command" && !pending.current)
      pending.current = crypto.randomUUID();
    const result = await callOps<T>(fetch, session?.access_token ?? "", {
      kind,
      name,
      workspaceId,
      payload,
      ...(kind === "command"
        ? {
            meta: {
              idempotencyKey: pending.current!,
              expectedVersion: version,
            },
          }
        : {}),
    });
    if (kind === "command") pending.current = null;
    return result;
  }
  useEffect(() => {
    let active = true;
    void call<typeof lot>("query", "lot.detail", { lotId })
      .then((data) => {
        if (active) setLot(data);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Lot could not load",
          );
      });
    return () => {
      active = false;
    };
  }, [client, workspaceId, lotId]);
  async function allocate() {
    if (!lot) return;
    setBusy(true);
    setError("");
    try {
      await call(
        "command",
        "lot.allocate",
        { lotId, overrides: {} },
        lot.version,
      );
      setLot(await call<typeof lot>("query", "lot.detail", { lotId }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Allocation could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-inventory">
      {error && <p role="alert">{error}</p>}
      <p>
        <a href="/app/inventory">Inventory</a> / Lot
      </p>
      {lot ? (
        <>
          <h2>{lot.name}</h2>
          <p>
            Total cost:{" "}
            {lot.total_cost_minor === undefined
              ? "Restricted"
              : lot.total_cost_minor === null
                ? "Unknown"
                : `${lot.currency} ${(lot.total_cost_minor / 100).toFixed(2)}`}
          </p>
          <p>
            {lot.items.length} {lot.items.length === 1 ? "item" : "items"}
          </p>
          <ul>
            {lot.items.map((item) => (
              <li key={item.id}>
                <a href={`/app/inventory/item?itemId=${item.id}`}>
                  {item.display_sku}
                </a>
                {item.cost_minor !== undefined &&
                  `, ${item.cost_minor === null ? "cost unknown" : `${item.cost_currency} ${(item.cost_minor / 100).toFixed(2)}`}`}
              </li>
            ))}
          </ul>
          <p>
            <a href={`/app/inventory/new?lotId=${encodeURIComponent(lotId)}`}>
              Add another item to this lot
            </a>
          </p>
          {(role === "owner" || role === "manager") && lot.items.length > 0 && (
            <button disabled={busy} onClick={allocate}>
              Allocate lot cost evenly
            </button>
          )}
        </>
      ) : (
        <p>Loading lot...</p>
      )}
    </section>
  );
}

export function Inventory({
  client,
  workspaceId,
  role,
}: {
  client: SupabaseClient;
  workspaceId: string;
  role: string;
}) {
  const path = window.location.pathname;
  const itemId = new URLSearchParams(window.location.search).get("itemId");
  const lotId = new URLSearchParams(window.location.search).get("lotId");
  if (path.endsWith("/lot") && lotId)
    return (
      <LotView
        client={client}
        workspaceId={workspaceId}
        lotId={lotId}
        role={role}
      />
    );
  return (
    <InventoryBody
      client={client}
      workspaceId={workspaceId}
      role={role}
      itemId={itemId}
      lotId={lotId}
    />
  );
}

function InventoryBody({
  client,
  workspaceId,
  role,
  itemId,
  lotId,
}: {
  client: SupabaseClient;
  workspaceId: string;
  role: string;
  itemId: string | null;
  lotId: string | null;
}) {
  const path = window.location.pathname;
  const isNew = path.endsWith("/new");
  const isDetail = path.endsWith("/item") && !!itemId;
  const [items, setItems] = useState<Item[] | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sku, setSku] = useState("");
  const [lotName, setLotName] = useState("");
  const [lotCost, setLotCost] = useState("");
  const [lot, setLot] = useState<Lot | null>(
    lotId ? { lotId, version: 0 } : null,
  );
  const [identifierKind, setIdentifierKind] = useState<
    "seller_sku" | "barcode_alias" | "ean"
  >("ean");
  const [identifierValue, setIdentifierValue] = useState("");
  const [correctedCost, setCorrectedCost] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const pending = useRef<{ key: string; fingerprint: string } | null>(null);

  async function request<T>(
    kind: "query" | "command",
    name: string,
    payload: object,
    expectedVersion: number | null = null,
  ): Promise<T> {
    const {
      data: { session },
    } = await client.auth.getSession();
    const fingerprint = JSON.stringify({ name, payload, expectedVersion });
    if (kind === "command" && pending.current?.fingerprint !== fingerprint)
      pending.current = { key: crypto.randomUUID(), fingerprint };
    const result = await callOps<T>(fetch, session?.access_token ?? "", {
      kind,
      name,
      workspaceId,
      payload,
      ...(kind === "command"
        ? { meta: { idempotencyKey: pending.current!.key, expectedVersion } }
        : {}),
    });
    if (kind === "command") pending.current = null;
    return result;
  }

  useEffect(() => {
    let active = true;
    setItems(null);
    setItem(null);
    setError("");
    const load = isDetail
      ? request<Item>("query", "item.detail", { itemId })
      : request<Item[]>("query", "inventory.list", { limit: 50 });
    void load
      .then((data) => {
        if (active) {
          if (isDetail) setItem(data as Item);
          else setItems(data as Item[]);
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Inventory could not load",
          );
      });
    return () => {
      active = false;
    };
  }, [client, workspaceId, itemId, isDetail]);

  async function createItem(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await request<{ itemId: string }>(
        "command",
        "item.create",
        {
          ...(sku.trim() ? { existingSku: sku.trim() } : {}),
          ...(lot ? { lotId: lot.lotId } : {}),
        },
      );
      window.location.assign(
        `/app/inventory/item?itemId=${encodeURIComponent(created.itemId)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Item could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createLot(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const cents = euroMinor(lotCost);
      const saved = await request<Lot>("command", "lot.create", {
        name: lotName,
        totalCostMinor: cents,
        currency: cents === null ? null : "EUR",
      });
      setLot(saved);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Lot could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addIdentifier(event: React.FormEvent) {
    event.preventDefault();
    if (!itemId || !item) return;
    setBusy(true);
    setError("");
    try {
      await request(
        "command",
        "identifier.add",
        { itemId, kind: identifierKind, value: identifierValue },
        item.version,
      );
      setItem(await request<Item>("query", "item.detail", { itemId }));
      setIdentifierValue("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Identifier could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }

  async function correctCost(event: React.FormEvent) {
    event.preventDefault();
    if (!itemId || !item) return;
    setBusy(true);
    setError("");
    try {
      const cents = euroMinor(correctedCost);
      await request(
        "command",
        "item.cost.correct",
        {
          itemId,
          costMinor: cents,
          currency: cents === null ? null : "EUR",
          reason: correctionReason.trim(),
        },
        item.version,
      );
      setItem(await request<Item>("query", "item.detail", { itemId }));
      setCorrectionReason("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Cost correction could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ops-inventory">
      {error && <p role="alert">{error}</p>}
      {isNew ? (
        <>
          <p>
            Create a draft now. Photos, location and cost can be added later.
          </p>
          <form onSubmit={createItem}>
            <label>
              Existing SKU (optional)
              <input
                value={sku}
                maxLength={80}
                onChange={(event) => setSku(event.target.value)}
              />
            </label>
            {lot && (
              <p>
                Adding to{" "}
                <a
                  href={`/app/inventory/lot?lotId=${encodeURIComponent(lot.lotId)}`}
                >
                  sourcing lot
                </a>
              </p>
            )}
            <button disabled={busy}>Save draft item</button>
          </form>
          {!lot && (
            <form onSubmit={createLot}>
              <h2>Or start a sourcing lot</h2>
              <label>
                Lot name
                <input
                  required
                  value={lotName}
                  onChange={(event) => setLotName(event.target.value)}
                />
              </label>
              <label>
                Total cost in EUR (optional)
                <input
                  inputMode="decimal"
                  value={lotCost}
                  onChange={(event) => setLotCost(event.target.value)}
                />
              </label>
              <button disabled={busy}>Create lot</button>
            </form>
          )}
        </>
      ) : isDetail ? (
        item ? (
          <>
            <p>
              <a href="/app/inventory">Inventory</a> / {item.display_sku}
            </p>
            <dl>
              <dt>SKU</dt>
              <dd>{item.display_sku}</dd>
              <dt>Custody</dt>
              <dd>{item.custody}</dd>
              <dt>Preparation</dt>
              <dd>{item.preparation}</dd>
              {item.cost_minor !== undefined && (
                <>
                  <dt>Cost</dt>
                  <dd>
                    {item.cost_minor === null
                      ? "Unknown"
                      : `${item.cost_currency} ${(item.cost_minor / 100).toFixed(2)}`}
                  </dd>
                </>
              )}
            </dl>
            {"lot_id" in item && typeof item.lot_id === "string" && (
              <p>
                <a
                  href={`/app/inventory/lot?lotId=${encodeURIComponent(item.lot_id)}`}
                >
                  View sourcing lot
                </a>
              </p>
            )}
            <h2>Identifiers</h2>
            <ul>
              {item.ops_item_identifiers?.map((identifier) => (
                <li key={`${identifier.kind}:${identifier.value}`}>
                  {identifier.kind}: {identifier.value}
                </li>
              ))}
            </ul>
            {role !== "warehouse" && (
              <form onSubmit={addIdentifier}>
                <label>
                  Identifier type
                  <select
                    value={identifierKind}
                    onChange={(event) =>
                      setIdentifierKind(
                        event.target.value as typeof identifierKind,
                      )
                    }
                  >
                    <option value="ean">EAN</option>
                    <option value="seller_sku">Seller SKU</option>
                    <option value="barcode_alias">Barcode alias</option>
                  </select>
                </label>
                <label>
                  Code
                  <input
                    required
                    value={identifierValue}
                    onChange={(event) => setIdentifierValue(event.target.value)}
                  />
                </label>
                <button disabled={busy}>Add identifier</button>
              </form>
            )}
            {(role === "owner" || role === "manager") && (
              <form onSubmit={correctCost}>
                <h2>Correct item cost</h2>
                <p>
                  Leave the amount empty when the cost is unknown. Enter 0 for a
                  free item.
                </p>
                <label>
                  Cost in EUR
                  <input
                    inputMode="decimal"
                    value={correctedCost}
                    onChange={(event) => setCorrectedCost(event.target.value)}
                  />
                </label>
                <label>
                  Reason
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={correctionReason}
                    onChange={(event) =>
                      setCorrectionReason(event.target.value)
                    }
                  />
                </label>
                <button disabled={busy}>Save cost correction</button>
              </form>
            )}
          </>
        ) : (
          <p>Loading item...</p>
        )
      ) : (
        <>
          <p>
            <a href="/app/inventory/new">Add an item</a>
          </p>
          {items === null ? (
            <p>Loading inventory...</p>
          ) : items.length === 0 ? (
            <p>No items yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Custody</th>
                  <th>Preparation</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <a
                        href={`/app/inventory/item?itemId=${encodeURIComponent(entry.id)}`}
                      >
                        {entry.display_sku}
                      </a>
                    </td>
                    <td>{entry.custody}</td>
                    <td>{entry.preparation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
