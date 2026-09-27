import { useEffect, useState } from "react";
import { callOps } from "../../gateway";

type Client = any;
type Order = {
  id: string;
  source: string;
  status: string;
  version: number;
  currency: string | null;
  seller_total_minor: number | null;
  created_at: string;
  ops_order_lines: Array<{
    id: string;
    item_id: string | null;
    item_code_snapshot: string | null;
    title_snapshot: string;
  }>;
};
type Detail = Order & {
  lines: Array<{
    id: string;
    item_code_snapshot: string | null;
    title_snapshot: string;
    seller_revenue_minor: number | null;
  }>;
  issues: Array<{ id: string; kind: string; detail: string }>;
};
type Resolved = {
  kind: string;
  items: Array<{ itemId: string; displaySku: string }>;
};
type DraftLine = { itemId: string; code: string; title: string };

export function Orders({
  client,
  workspaceId,
  role,
}: {
  client: Client;
  workspaceId: string;
  role: string;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [paid, setPaid] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [busy, setBusy] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  async function token() {
    return (await client.auth.getSession()).data.session?.access_token ?? "";
  }
  async function load() {
    const result = await callOps<Order[]>(fetch, await token(), {
      kind: "query",
      name: "order.list",
      workspaceId,
      payload: {},
    });
    setOrders(result);
  }
  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load orders",
      ),
    );
  }, [workspaceId]);
  useEffect(() => {
    const id = window.location.pathname.match(
      /^\/app\/orders\/([0-9a-f-]{36})$/i,
    )?.[1];
    if (!id) return;
    let active = true;
    void token()
      .then((sessionToken) =>
        callOps<Detail>(fetch, sessionToken, {
          kind: "query",
          name: "order.detail",
          workspaceId,
          payload: { orderId: id },
        }),
      )
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load order",
          );
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  async function addCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await callOps<Resolved>(fetch, await token(), {
        kind: "query",
        name: "scan.resolve",
        workspaceId,
        payload: { code },
      });
      if (result.kind !== "item" || result.items.length !== 1)
        throw new Error("Scan must identify exactly one physical item");
      const item = result.items[0];
      if (lines.some((line) => line.itemId === item.itemId))
        throw new Error("Item is already in this order");
      setLines((current) => [
        ...current,
        { itemId: item.itemId, code: item.displaySku, title: item.displaySku },
      ]);
      setCode("");
      setPendingKey(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not resolve item",
      );
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const key = pendingKey ?? crypto.randomUUID();
    setPendingKey(key);
    try {
      const total =
        amount.trim() === "" ? null : Math.round(Number(amount) * 100);
      if (total !== null && (!Number.isSafeInteger(total) || total < 0))
        throw new Error("Enter a valid seller total");
      const created = await callOps<{ orderId: string; status: string }>(
        fetch,
        await token(),
        {
          kind: "command",
          name: "order.manual.create",
          workspaceId,
          payload: {
            paidConfirmed: paid,
            currency: total === null ? null : currency,
            sellerTotalMinor: total,
            lines: lines.map(({ itemId, title }) => ({ itemId, title })),
          },
          meta: { idempotencyKey: key, expectedVersion: null },
        },
      );
      setNotice(`Manual order ${created.orderId} saved as ${created.status}.`);
      setLines([]);
      setAmount("");
      setPaid(false);
      setPendingKey(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save order");
    } finally {
      setBusy(false);
    }
  }
  async function reserve(order: Order) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await callOps(fetch, await token(), {
        kind: "command",
        name: "order.reserve",
        workspaceId,
        payload: { orderId: order.id },
        meta: {
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: order.version,
        },
      });
      setNotice(`Order ${order.id} reserved for picking.`);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not reserve order",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-order-page">
      <p>
        Manual orders require a human to confirm payment. Only confirmed orders
        can reserve stock.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {role !== "warehouse" && (
        <section>
          <h2>Create manual order</h2>
          <form onSubmit={addCode}>
            <label>
              Item SKU or barcode{" "}
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
            <button type="submit">Add item</button>
          </form>
          <form onSubmit={create}>
            {lines.map((line, index) => (
              <label key={line.itemId}>
                {line.code} title
                <input
                  required
                  maxLength={200}
                  value={line.title}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, i) =>
                        i === index
                          ? { ...entry, title: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => {
                    setLines((current) =>
                      current.filter((entry) => entry.itemId !== line.itemId),
                    );
                    setPendingKey(null);
                  }}
                >
                  Remove
                </button>
              </label>
            ))}
            <label>
              Seller total, if known{" "}
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setPendingKey(null);
                }}
                placeholder="Unknown"
              />
            </label>
            {amount.trim() !== "" && (
              <label>
                Currency{" "}
                <select
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setPendingKey(null);
                  }}
                >
                  <option>EUR</option>
                  <option>GBP</option>
                  <option>USD</option>
                </select>
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={paid}
                onChange={(event) => {
                  setPaid(event.target.checked);
                  setPendingKey(null);
                }}
              />{" "}
              Payment personally confirmed
            </label>
            <button type="submit" disabled={busy || lines.length === 0}>
              Save manual order
            </button>
          </form>
        </section>
      )}
      <section>
        <h2>Orders</h2>
        {orders.length === 0 ? (
          <p>No orders yet.</p>
        ) : (
          <ul>
            {orders.map((order) => (
              <li key={order.id}>
                <strong>
                  {order.source === "manual" ? "Manual" : "Vinted Pro"} order
                </strong>{" "}
                <code>{order.id}</code> <span>{order.status}</span>
                <span>
                  {" "}
                  {order.ops_order_lines.length} item
                  {order.ops_order_lines.length === 1 ? "" : "s"}
                </span>
                <ul>
                  {order.ops_order_lines.map((line) => (
                    <li key={line.id}>
                      {line.item_code_snapshot ?? "Unmapped item"}:{" "}
                      {line.title_snapshot}
                    </li>
                  ))}
                </ul>
                {order.status === "confirmed" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reserve(order)}
                  >
                    Reserve all items
                  </button>
                )}
                <a href={`/app/orders/${order.id}`}>View order</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      {detail && (
        <section>
          <h2>Order detail</h2>
          <p>
            {detail.status} · {detail.source}
          </p>
          <ul>
            {detail.lines.map((line) => (
              <li key={line.id}>
                {line.item_code_snapshot ?? "Unmapped item"}:{" "}
                {line.title_snapshot}
              </li>
            ))}
          </ul>
          {detail.issues.map((issue) => (
            <p key={issue.id} role="alert">
              {issue.kind}: {issue.detail}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
