import { useEffect, useState } from "react";
import { callOps } from "../../gateway";

type Client = any;
type Order = {
  id: string;
  status: string;
  ops_order_lines: Array<{ id: string }>;
};
type Wave = { id: string; mode: string; status: string; created_at: string };
type Task = {
  id: string;
  order_id: string;
  tote_code: string | null;
  status: string;
  claim_id: string | null;
  claim_until: string | null;
  version: number;
  ops_items: { display_sku: string } | null;
  ops_locations: { code: string } | null;
};
type Detail = { wave: Wave; tasks: Task[] };
export function Pick({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}) {
  const [orders, setOrders] = useState<Order[]>([]),
    [waves, setWaves] = useState<Wave[]>([]),
    [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [totes, setTotes] = useState<Record<string, string>>({});
  const [activeTask, setActiveTask] = useState<string | null>(null),
    [itemCode, setItemCode] = useState(""),
    [toteCode, setToteCode] = useState(""),
    [reason, setReason] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function token() {
    return (await client.auth.getSession()).data.session?.access_token ?? "";
  }
  async function refresh(waveId?: string) {
    const auth = await token();
    const [ordersResult, wavesResult] = await Promise.all([
      callOps<Order[]>(fetch, auth, {
        kind: "query",
        name: "order.list",
        workspaceId,
        payload: { status: "reserved" },
      }),
      callOps<Wave[]>(fetch, auth, {
        kind: "query",
        name: "pick.wave.list",
        workspaceId,
        payload: {},
      }),
    ]);
    setOrders(ordersResult);
    setWaves(wavesResult);
    if (waveId)
      window.history.replaceState(null, "", `/app/pick?waveId=${waveId}`);
    const id =
      waveId ?? new URLSearchParams(window.location.search).get("waveId");
    if (id)
      setDetail(
        await callOps<Detail>(fetch, auth, {
          kind: "query",
          name: "pick.wave.detail",
          workspaceId,
          payload: { waveId: id },
        }),
      );
  }
  useEffect(() => {
    void refresh().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load pick station",
      ),
    );
  }, [workspaceId]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await callOps<{ waveId: string }>(fetch, await token(), {
        kind: "command",
        name: "pick.wave.create",
        workspaceId,
        payload: {
          orders: selected.map((orderId) => ({
            orderId,
            toteCode: selected.length === 1 ? null : (totes[orderId] ?? ""),
          })),
        },
        meta: { idempotencyKey: crypto.randomUUID(), expectedVersion: null },
      });
      setSelected([]);
      setTotes({});
      setNotice("Pick wave created.");
      await refresh(result.waveId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create pick wave",
      );
    } finally {
      setBusy(false);
    }
  }
  const task = detail?.tasks.find((entry) => entry.id === activeTask) ?? null;
  async function claim(entry: Task) {
    setError("");
    setBusy(true);
    try {
      await callOps(fetch, await token(), {
        kind: "command",
        name: "pick.task.claim",
        workspaceId,
        payload: { taskId: entry.id },
        meta: {
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: entry.version,
        },
      });
      setActiveTask(entry.id);
      await refresh(detail!.wave.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not claim task. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish(kind: "verify" | "missing", event: React.FormEvent) {
    event.preventDefault();
    if (!task?.claim_id) return;
    setError("");
    setBusy(true);
    try {
      await callOps(fetch, await token(), {
        kind: "command",
        name: kind === "verify" ? "pick.task.verify" : "pick.task.missing",
        workspaceId,
        payload:
          kind === "verify"
            ? {
                taskId: task.id,
                claimId: task.claim_id,
                itemCode,
                toteCode: task.tote_code ? toteCode : null,
              }
            : { taskId: task.id, claimId: task.claim_id, reason },
        meta: {
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: task.version,
        },
      });
      setNotice(
        kind === "verify"
          ? "Item verified for this order."
          : "Missing item recorded for review.",
      );
      setActiveTask(null);
      setItemCode("");
      setToteCode("");
      setReason("");
      await refresh(detail!.wave.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pick check failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-pick-page">
      <p>Scan each exact item. A batch tote must also match its order.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section>
        <h2>Create pick wave</h2>
        <form onSubmit={create}>
          {orders.length === 0 ? (
            <p>No reserved orders are ready.</p>
          ) : (
            orders.map((order) => (
              <div key={order.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(order.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, order.id]
                          : current.filter((id) => id !== order.id),
                      )
                    }
                  />{" "}
                  Order {order.id.slice(0, 8)} ({order.ops_order_lines.length}{" "}
                  items)
                </label>
                {selected.length > 1 && selected.includes(order.id) && (
                  <label>
                    Tote code for {order.id.slice(0, 8)}{" "}
                    <input
                      required
                      value={totes[order.id] ?? ""}
                      onChange={(event) =>
                        setTotes((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}
              </div>
            ))
          )}
          <button disabled={busy || selected.length === 0}>Create wave</button>
        </form>
      </section>
      <section>
        <h2>Pick waves</h2>
        <ul>
          {waves.map((wave) => (
            <li key={wave.id}>
              <button type="button" onClick={() => void refresh(wave.id)}>
                {wave.id.slice(0, 8)}: {wave.status}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {detail && (
        <section>
          <h2>Wave {detail.wave.id.slice(0, 8)}</h2>
          <p>{detail.wave.status}</p>
          <ol>
            {detail.tasks.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {entry.ops_items?.display_sku ?? "Unknown item"}
                </strong>{" "}
                at {entry.ops_locations?.code ?? "unassigned location"}, order{" "}
                {entry.order_id.slice(0, 8)}
                {entry.tote_code ? `, tote ${entry.tote_code}` : ""}.{" "}
                {entry.status}
                {entry.status === "pending" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void claim(entry)}
                  >
                    Claim task
                  </button>
                )}
                {entry.status === "claimed" && entry.claim_id && (
                  <button type="button" onClick={() => setActiveTask(entry.id)}>
                    Continue my claim
                  </button>
                )}
              </li>
            ))}
          </ol>
          {task?.claim_id && (
            <div>
              <h3>Verify {task.ops_items?.display_sku}</h3>
              <form onSubmit={(event) => void finish("verify", event)}>
                <label>
                  Item code{" "}
                  <input
                    required
                    value={itemCode}
                    onChange={(event) => setItemCode(event.target.value)}
                  />
                </label>
                {task.tote_code && (
                  <label>
                    Tote code{" "}
                    <input
                      required
                      value={toteCode}
                      onChange={(event) => setToteCode(event.target.value)}
                    />
                  </label>
                )}
                <button disabled={busy}>Verify pick</button>
              </form>
              <form onSubmit={(event) => void finish("missing", event)}>
                <label>
                  Why is this item missing?{" "}
                  <input
                    required
                    minLength={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button disabled={busy}>Record missing item</button>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
