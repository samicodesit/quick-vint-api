import { useEffect, useState } from "react";
import { callOps } from "../../gateway";
type Client = any;
type Order = {
  id: string;
  status: string;
  ops_order_lines: Array<{ id: string }>;
};
type Detail = {
  session: {
    id: string;
    shipment_id: string;
    status: string;
    label_id: string | null;
  } | null;
  lines: Array<{
    id: string;
    item_code_snapshot: string | null;
    title_snapshot: string;
  }>;
  scans: Array<{ line_id: string }>;
  labels: Array<{ id: string; source: string; created_at: string }>;
};
export function Pack({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}) {
  const [orders, setOrders] = useState<Order[]>([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null);
  const [itemCode, setItemCode] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function token() {
    return (await client.auth.getSession()).data.session?.access_token ?? "";
  }
  async function refresh(orderId?: string) {
    const auth = await token();
    const found = await callOps<Order[]>(fetch, auth, {
      kind: "query",
      name: "order.list",
      workspaceId,
      payload: { status: "picking" },
    });
    setOrders(found);
    const id =
      orderId ||
      selected ||
      new URLSearchParams(window.location.search).get("orderId");
    if (id) {
      setSelected(id);
      window.history.replaceState(null, "", `/app/pack?orderId=${id}`);
      setDetail(
        await callOps<Detail>(fetch, auth, {
          kind: "query",
          name: "pack.detail",
          workspaceId,
          payload: { orderId: id },
        }),
      );
    }
  }
  useEffect(() => {
    void refresh().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load packing station",
      ),
    );
  }, [workspaceId]);
  async function command(
    name: string,
    payload: Record<string, unknown>,
    expectedVersion: number | null = null,
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
        meta: { idempotencyKey: crypto.randomUUID(), expectedVersion },
      });
      await refresh();
      return result;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Packing action failed",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !selected) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch(
        `/api/ops-label?workspaceId=${workspaceId}&orderId=${selected}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await token()}`,
            "Content-Type": "application/pdf",
          },
          body: file,
        },
      );
      const result = (await response.json()) as {
        labelId?: string;
        error?: string;
      };
      if (!response.ok || !result.labelId)
        throw new Error(result.error ?? "Could not upload label");
      setNotice("Private PDF label saved for this order.");
      setFile(null);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not upload label",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openLabel(labelId: string) {
    try {
      const response = await fetch(
        `/api/ops-label?workspaceId=${workspaceId}&labelId=${labelId}`,
        { headers: { Authorization: `Bearer ${await token()}` } },
      );
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url)
        throw new Error(data.error ?? "Label unavailable");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Label unavailable");
    }
  }
  return (
    <div className="ops-pack-page">
      <p>
        Scan the picked items and attach the right label. Printing does not
        record handover.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section>
        <h2>Ready to pack</h2>
        {orders.length === 0 ? (
          <p>No fully picked orders are waiting.</p>
        ) : (
          <ul>
            {orders.map((order) => (
              <li key={order.id}>
                <button type="button" onClick={() => void refresh(order.id)}>
                  Order {order.id.slice(0, 8)} ({order.ops_order_lines.length}{" "}
                  items)
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <section>
          <h2>Order {selected.slice(0, 8)}</h2>
          {!detail?.session ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void command("pack.start", { orderId: selected })}
            >
              Start pack
            </button>
          ) : (
            <>
              <p>Pack session: {detail.session.status}</p>
              <ul>
                {detail.lines.map((line) => (
                  <li key={line.id}>
                    {line.item_code_snapshot ?? "Unknown item"}:{" "}
                    {line.title_snapshot}{" "}
                    {detail.scans.some((scan) => scan.line_id === line.id)
                      ? "Scanned"
                      : "Awaiting scan"}
                  </li>
                ))}
              </ul>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (
                    await command("pack.scan", {
                      sessionId: detail.session!.id,
                      itemCode,
                    })
                  )
                    setItemCode("");
                }}
              >
                <label>
                  Item code{" "}
                  <input
                    required
                    disabled={busy}
                    value={itemCode}
                    onChange={(event) => setItemCode(event.target.value)}
                  />
                </label>
                <button disabled={busy}>Scan into pack</button>
              </form>
              <form onSubmit={upload}>
                <label>
                  Upload a PDF label for this order{" "}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <button disabled={busy || !file}>Save PDF label</button>
              </form>
              {detail.labels.map((label) => (
                <div key={label.id}>
                  <span>{label.source} label</span>{" "}
                  <button
                    type="button"
                    onClick={() => void openLabel(label.id)}
                  >
                    Open or reprint
                  </button>{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void command("pack.label.attach", {
                        sessionId: detail.session!.id,
                        labelId: label.id,
                      })
                    }
                  >
                    Attach to this pack
                  </button>
                </div>
              ))}
              {detail.session.label_id && (
                <p>
                  Label attached to this pack. Confirm physical handover only
                  after the package leaves.
                </p>
              )}
              <button
                type="button"
                disabled={
                  busy ||
                  !detail.session.label_id ||
                  detail.scans.length !== detail.lines.length
                }
                onClick={async () => {
                  if (
                    await command("shipment.handover", {
                      shipmentId: detail.session!.shipment_id,
                    })
                  ) {
                    setNotice("Physical handover recorded.");
                    setDetail(null);
                    setSelected("");
                  }
                }}
              >
                Record physical handover
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
