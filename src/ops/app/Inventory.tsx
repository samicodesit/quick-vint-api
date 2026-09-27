import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callOps } from "./gateway";
import { PrintLabel, Scanner } from "./Scanner";
import { Station } from "./Station";
import { itemLookupCode } from "../../../utils/ops/inventory/labels";

type Item = {
  id: string;
  display_sku: string;
  custody: string;
  preparation: string;
  version: number;
  cost_minor?: number | null;
  cost_currency?: string | null;
  imported_title?: string | null;
  imported_location_text?: string | null;
  imported_sale_state?: string | null;
  imported_source?: string | null;
  imported_image_url?: string | null;
  ops_item_identifiers?: Array<{ kind: string; value: string }>;
  location_id?: string | null;
};
type ListItem = {
  id: string;
  displaySku: string;
  shortTitle: string | null;
  thumbnailUrl?: string;
  custody: string;
  preparation: string;
  locationCode: string | null;
  version: number;
};
type InventoryPage = {
  items: ListItem[];
  nextCursor: { createdAt: string; id: string } | null;
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
  if (path.endsWith("/put-away"))
    return <Station client={client} workspaceId={workspaceId} role={role} />;
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
  const [page, setPage] = useState<InventoryPage | null>(null);
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
  const query = new URLSearchParams(window.location.search);
  const searchTerm = query.get("search") ?? "";
  const custodyFilter = query.get("custody") ?? "";
  const [scanMessage, setScanMessage] = useState("");
  const [nextCursor, setNextCursor] =
    useState<InventoryPage["nextCursor"]>(null);
  const [filterName, setFilterName] = useState("");
  const [savedFilters, setSavedFilters] = useState<
    Array<{ name: string; query: string }>
  >(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`ops-inventory-filters:${workspaceId}`) ?? "[]",
      );
      return Array.isArray(saved)
        ? saved.filter(
            (entry) =>
              typeof entry?.name === "string" &&
              typeof entry?.query === "string",
          )
        : [];
    } catch {
      return [];
    }
  });
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
    setPage(null);
    setItem(null);
    setError("");
    const load = isDetail
      ? request<Item>("query", "item.detail", { itemId })
      : request<InventoryPage>("query", "inventory.list", {
          limit: 50,
          ...(searchTerm ? { search: searchTerm } : {}),
          ...(custodyFilter ? { custody: custodyFilter } : {}),
        });
    void load
      .then((data) => {
        if (active) {
          if (isDetail) setItem(data as Item);
          else {
            setPage(data as InventoryPage);
            setNextCursor((data as InventoryPage).nextCursor);
          }
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
  }, [client, workspaceId, itemId, isDetail, searchTerm, custodyFilter]);

  useEffect(() => {
    if (isDetail || !page) return;
    const key = `ops-inventory-scroll:${workspaceId}:${window.location.search}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      window.scrollTo(0, Number(stored));
      sessionStorage.removeItem(key);
    }
  }, [page, isDetail, workspaceId]);

  async function loadMore() {
    if (!nextCursor) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<InventoryPage>("query", "inventory.list", {
        limit: 50,
        cursor: nextCursor,
        ...(searchTerm ? { search: searchTerm } : {}),
        ...(custodyFilter ? { custody: custodyFilter } : {}),
      });
      setPage((current) => ({
        items: [...(current?.items ?? []), ...result.items],
        nextCursor: result.nextCursor,
      }));
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "More inventory could not load",
      );
    } finally {
      setBusy(false);
    }
  }

  async function globalScan(code: string) {
    setScanMessage("");
    try {
      const result = await request<{
        kind: string;
        items: Array<{ itemId: string; displaySku: string }>;
        locations: Array<{ locationId: string; code: string }>;
      }>("query", "scan.resolve", { code });
      if (result.kind === "item") {
        window.location.assign(
          `/app/inventory/item?itemId=${encodeURIComponent(result.items[0].itemId)}`,
        );
        return;
      }
      if (result.kind === "location") {
        setScanMessage(
          `Location ${result.locations[0].code} found. Open Put away to move stock there.`,
        );
        return;
      }
      setScanMessage(
        result.kind === "ambiguous"
          ? "This code matches multiple records. Scan a physical SKU or item QR instead."
          : "No item or location matches that code.",
      );
    } catch (cause) {
      setScanMessage(cause instanceof Error ? cause.message : "Scan failed");
    }
  }

  function saveFilter(event: React.FormEvent) {
    event.preventDefault();
    if (!filterName.trim()) return;
    const next = [
      ...savedFilters.filter((filter) => filter.name !== filterName.trim()),
      { name: filterName.trim(), query: window.location.search },
    ];
    localStorage.setItem(
      `ops-inventory-filters:${workspaceId}`,
      JSON.stringify(next),
    );
    setSavedFilters(next);
    setFilterName("");
  }

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
    <section
      className={
        isDetail ? "ops-inventory ops-inventory--detail" : "ops-inventory"
      }
    >
      {error && <p role="alert">{error}</p>}
      {isNew ? (
        <>
          <p>
            Create a draft now. Photos, location and cost can be added later.
          </p>
          <p>
            <a href="/app/import">Import existing stock from CSV</a>
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
              <a
                href={`/app/inventory${new URLSearchParams(window.location.search).get("return") ?? ""}`}
              >
                Inventory
              </a>{" "}
              / {item.display_sku}
            </p>
            <dl>
              <dt>SKU</dt>
              <dd>{item.display_sku}</dd>
              <dt>Custody</dt>
              <dd>{item.custody}</dd>
              <dt>Preparation</dt>
              <dd>{item.preparation}</dd>
              {item.imported_title && (
                <>
                  <dt>Imported title</dt>
                  <dd>{item.imported_title}</dd>
                </>
              )}
              {item.imported_location_text && (
                <>
                  <dt>Imported location note</dt>
                  <dd>
                    {item.imported_location_text} (not assigned to a physical
                    location)
                  </dd>
                </>
              )}
              {item.imported_sale_state && (
                <>
                  <dt>Imported sale state</dt>
                  <dd>
                    {item.imported_sale_state} (not reconciled as an order)
                  </dd>
                </>
              )}
              {item.imported_source && (
                <>
                  <dt>Imported source</dt>
                  <dd>{item.imported_source}</dd>
                </>
              )}
              {item.imported_image_url && (
                <>
                  <dt>Image reference</dt>
                  <dd>Unresolved. Add original photos to this item.</dd>
                </>
              )}
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
            {item.location_id && (
              <p>
                Current location:{" "}
                <a
                  href={`/app/inventory/put-away?locationId=${encodeURIComponent(item.location_id)}`}
                >
                  {item.location_id}
                </a>
              </p>
            )}
            <PrintLabel
              code={itemLookupCode(item.id)}
              label={item.display_sku}
            />
            <p>
              <a href={`/app/capture?itemId=${encodeURIComponent(item.id)}`}>
                Add photos
              </a>
            </p>
            {role !== "warehouse" && (
              <p>
                <a
                  href={`/app/listings/review?itemId=${encodeURIComponent(item.id)}`}
                >
                  Review facts and prepare listing
                </a>
              </p>
            )}
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
            <a href="/app/inventory/new">Add an item</a> ·{" "}
            <a href="/app/inventory/put-away">Put away stock</a>
          </p>
          <form method="get" action="/app/inventory">
            <label>
              Search SKU or barcode
              <input name="search" defaultValue={searchTerm} />
            </label>
            <label>
              Custody
              <select name="custody" defaultValue={custodyFilter}>
                <option value="">All</option>
                <option value="on_hand">On hand</option>
                <option value="outbound">Outbound</option>
                <option value="return_quarantine">Return quarantine</option>
                <option value="missing">Missing</option>
                <option value="written_off">Written off</option>
              </select>
            </label>
            <button>Search</button>
          </form>
          <form onSubmit={saveFilter}>
            <h2>Saved filters on this device</h2>
            <label>
              Filter name
              <input
                required
                value={filterName}
                onChange={(event) => setFilterName(event.target.value)}
              />
            </label>
            <button>Save current filter</button>
            <ul>
              {savedFilters.map((filter) => (
                <li key={filter.name}>
                  <a href={`/app/inventory${filter.query}`}>{filter.name}</a>
                </li>
              ))}
            </ul>
          </form>
          <h2>Scan to open</h2>
          <Scanner
            onCode={(code) => {
              void globalScan(code);
            }}
          />
          {scanMessage && <p role="status">{scanMessage}</p>}
          {page === null ? (
            <p>Loading inventory...</p>
          ) : page.items.length === 0 ? (
            <p>No items yet.</p>
          ) : (
            <div className="ops-inventory-table">
              <table>
                <thead>
                  <tr>
                    <th>Garment</th>
                    <th>Custody</th>
                    <th>Preparation</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <div className="ops-inventory-identity">
                          {entry.thumbnailUrl ? (
                            <img
                              src={entry.thumbnailUrl}
                              alt=""
                              width={56}
                              height={56}
                            />
                          ) : (
                            <span className="ops-inventory-no-photo">
                              No photo
                            </span>
                          )}
                          <span>
                            <a
                              href={`/app/inventory/item?itemId=${encodeURIComponent(entry.id)}&return=${encodeURIComponent(window.location.search)}`}
                              onClick={() =>
                                sessionStorage.setItem(
                                  `ops-inventory-scroll:${workspaceId}:${window.location.search}`,
                                  String(window.scrollY),
                                )
                              }
                            >
                              {entry.shortTitle || "Untitled garment"}
                            </a>
                            <small>{entry.displaySku}</small>
                          </span>
                        </div>
                      </td>
                      <td>{entry.custody}</td>
                      <td>{entry.preparation}</td>
                      <td>{entry.locationCode ?? "Not located"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nextCursor && (
            <button
              disabled={busy}
              onClick={() => {
                void loadMore();
              }}
            >
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}
