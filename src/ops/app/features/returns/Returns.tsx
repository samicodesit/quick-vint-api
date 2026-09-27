import { useEffect, useState } from "react";
import { callOps } from "../../gateway";
type Client = any;
type Order = { id: string; status: string };
type ReturnRow = {
  id: string;
  order_id: string;
  status: string;
  ops_return_lines: Array<{ id: string; status: string }>;
};
type Line = {
  id: string;
  item_id: string;
  status: string;
  inspection_note: string | null;
  ops_items: { display_sku: string; version: number; custody: string } | null;
};
type Detail = {
  return: { id: string; order_id: string; status: string };
  lines: Line[];
};
type Location = { id: string; code: string };
export function Returns({
  client,
  workspaceId,
  role,
}: {
  client: Client;
  workspaceId: string;
  role: string;
}) {
  const [orders, setOrders] = useState<Order[]>([]),
    [returns, setReturns] = useState<ReturnRow[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [locations, setLocations] = useState<Location[]>([]);
  const [orderId, setOrderId] = useState(""),
    [itemCode, setItemCode] = useState(""),
    [decision, setDecision] = useState<Record<string, string>>({}),
    [note, setNote] = useState<Record<string, string>>({}),
    [location, setLocation] = useState<Record<string, string>>({});
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function token() {
    return (await client.auth.getSession()).data.session?.access_token ?? "";
  }
  async function refresh(returnId?: string) {
    const auth = await token();
    const [found, rows, places] = await Promise.all([
      callOps<Order[]>(fetch, auth, {
        kind: "query",
        name: "order.list",
        workspaceId,
        payload: { status: "dispatched" },
      }),
      callOps<ReturnRow[]>(fetch, auth, {
        kind: "query",
        name: "return.list",
        workspaceId,
        payload: {},
      }),
      callOps<Location[]>(fetch, auth, {
        kind: "query",
        name: "location.list",
        workspaceId,
        payload: {},
      }),
    ]);
    setOrders(found);
    setReturns(rows);
    setLocations(places);
    const id =
      returnId ?? new URLSearchParams(window.location.search).get("returnId");
    if (id) {
      window.history.replaceState(null, "", `/app/returns?returnId=${id}`);
      setDetail(
        await callOps<Detail>(fetch, auth, {
          kind: "query",
          name: "return.detail",
          workspaceId,
          payload: { returnId: id },
        }),
      );
    }
  }
  useEffect(() => {
    void refresh().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load returns",
      ),
    );
  }, [workspaceId]);
  async function command(
    name: string,
    payload: Record<string, unknown>,
    version: number | null = null,
  ) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await callOps<any>(fetch, await token(), {
        kind: "command",
        name,
        workspaceId,
        payload,
        meta: { idempotencyKey: crypto.randomUUID(), expectedVersion: version },
      });
      await refresh(name === "return.receipt" ? result.returnId : undefined);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Return action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-returns-page">
      <p>
        Receipt and inspection track the garment itself. A refund does not make
        it saleable.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section>
        <h2>Receive a return</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await command("return.receipt", {
              orderId,
              itemCodes: [itemCode],
            });
            if (result) {
              setNotice("Garment received into quarantine.");
              setItemCode("");
            }
          }}
        >
          <label>
            Dispatched order{" "}
            <select
              required
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Choose order</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Exact item code{" "}
            <input
              required
              value={itemCode}
              onChange={(event) => setItemCode(event.target.value)}
            />
          </label>
          <button disabled={busy || !orderId}>Record receipt</button>
        </form>
      </section>
      <section>
        <h2>Return queue</h2>
        {returns.length === 0 ? (
          <p>No returns recorded.</p>
        ) : (
          <ul>
            {returns.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => void refresh(entry.id)}>
                  {entry.id.slice(0, 8)}: {entry.status} (
                  {entry.ops_return_lines.length} items)
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {detail && (
        <section>
          <h2>Return {detail.return.id.slice(0, 8)}</h2>
          <p>Original order {detail.return.order_id}</p>
          {detail.lines.map((line) => (
            <div key={line.id}>
              <h3>{line.ops_items?.display_sku ?? line.item_id}</h3>
              <p>
                Custody: {line.ops_items?.custody}. Inspection: {line.status}.
              </p>
              {line.status === "received" && (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await command("return.inspect", {
                        returnLineId: line.id,
                        decision: decision[line.id] ?? "quarantine",
                        note: note[line.id] ?? "",
                      })
                    )
                      setNotice(
                        "Inspection recorded. Restock still needs approval.",
                      );
                  }}
                >
                  <label>
                    Inspection decision{" "}
                    <select
                      value={decision[line.id] ?? "quarantine"}
                      onChange={(event) =>
                        setDecision((current) => ({
                          ...current,
                          [line.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="quarantine">Keep in quarantine</option>
                      <option value="resellable">Cleared for resale</option>
                      <option value="damaged">Damaged</option>
                    </select>
                  </label>
                  <label>
                    Note{" "}
                    <input
                      maxLength={1000}
                      value={note[line.id] ?? ""}
                      onChange={(event) =>
                        setNote((current) => ({
                          ...current,
                          [line.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button disabled={busy}>Save inspection</button>
                </form>
              )}
              {line.status === "resellable" &&
                ["owner", "manager"].includes(role) && (
                  <div>
                    <label>
                      Restock location{" "}
                      <select
                        value={location[line.id] ?? ""}
                        onChange={(event) =>
                          setLocation((current) => ({
                            ...current,
                            [line.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">No location yet</option>
                        {locations.map((place) => (
                          <option key={place.id} value={place.id}>
                            {place.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await command(
                            "return.restock",
                            {
                              returnLineId: line.id,
                              locationId: location[line.id] || null,
                            },
                            line.ops_items?.version ?? null,
                          )
                        )
                          setNotice(
                            "Item restocked. Listing needs a fresh review.",
                          );
                      }}
                    >
                      Approve restock
                    </button>
                  </div>
                )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
