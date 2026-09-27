import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callOps } from "../../gateway";

type Garment = { display_sku: string; catalog_title: string | null } | null;
type Summary = {
  orders: Array<{
    id: string;
    status: string;
    created_at: string;
    ship_by_at: string | null;
  }>;
  listings: Array<{
    item_id: string;
    status: string;
    ops_items: Garment;
  }>;
  captures: Array<{
    item_id: string;
    ops_items: Garment;
  }>;
  problems: number;
  connection: {
    verified_at: string | null;
    last_reconciled_at: string | null;
    read_orders_verified: boolean;
  } | null;
};

function name(item: Garment) {
  return item?.catalog_title || item?.display_sku || "Untitled garment";
}

export function Today({
  client,
  workspaceId,
  role,
}: {
  client: SupabaseClient;
  workspaceId: string;
  role: string;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  async function load() {
    const token =
      (await client.auth.getSession()).data.session?.access_token ?? "";
    setSummary(
      await callOps<Summary>(fetch, token, {
        kind: "query",
        name: "today.summary",
        workspaceId,
        payload: {},
      }),
    );
  }
  useEffect(() => {
    let active = true;
    const token = client.auth
      .getSession()
      .then(({ data }) => data.session?.access_token ?? "");
    void token
      .then((value) =>
        callOps<Summary>(fetch, value, {
          kind: "query",
          name: "today.summary",
          workspaceId,
          payload: {},
        }),
      )
      .then((value) => {
        if (active) setSummary(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load today",
          );
      });
    return () => {
      active = false;
    };
  }, [client, workspaceId]);
  const now = Date.now();
  return (
    <div className="ops-today">
      <p>Start with orders and problems, then finish listing and photo work.</p>
      <p>
        <a href="/app/import">Import existing stock</a> ·{" "}
        <a href="/app/inventory/new">Add new stock</a>
      </p>
      <button
        type="button"
        onClick={() =>
          void load().catch((cause) =>
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not refresh today",
            ),
          )
        }
      >
        Refresh work
      </button>
      {error && <p role="alert">{error}</p>}
      {!summary ? (
        <p>Loading work...</p>
      ) : (
        <>
          <section>
            <h2>Problems needing attention: {summary.problems}</h2>
            {summary.problems > 0 && (
              <p>
                Check <a href="/app/orders">order issues</a> and workspace
                exceptions before dispatch.
              </p>
            )}
            {["owner", "manager"].includes(role) && !summary.connection && (
              <p>No official order connection has been verified.</p>
            )}
            {summary.connection && (
              <p>
                Vinted order connection:{" "}
                {summary.connection.read_orders_verified
                  ? "verified"
                  : "unverified"}
                . Last reconciliation:{" "}
                {summary.connection.last_reconciled_at
                  ? new Date(
                      summary.connection.last_reconciled_at,
                    ).toLocaleString()
                  : "none"}
                .
                {summary.connection.last_reconciled_at &&
                Date.now() - Date.parse(summary.connection.last_reconciled_at) >
                  60 * 60 * 1000
                  ? " Reconciliation is over an hour old."
                  : ""}
              </p>
            )}
          </section>
          <section>
            <h2>Orders to fulfil</h2>
            {summary.orders.length === 0 ? (
              <p>No active orders.</p>
            ) : (
              <ol>
                {summary.orders.map((order) => (
                  <li key={order.id}>
                    <a
                      href={`/app/orders?orderId=${encodeURIComponent(order.id)}`}
                    >
                      Order {order.id.slice(0, 8)}
                    </a>{" "}
                    <strong>{order.status}</strong>.{" "}
                    {order.ship_by_at
                      ? `${Date.parse(order.ship_by_at) < now ? "Overdue since" : "Ship by"} ${new Date(order.ship_by_at).toLocaleString()}`
                      : "Ship date not supplied"}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section>
            <h2>Listing work</h2>
            {summary.listings.length === 0 ? (
              <p>No listing work waiting.</p>
            ) : (
              <ul>
                {summary.listings.map((listing) => (
                  <li key={listing.item_id}>
                    <a
                      href={`/app/listings/review?itemId=${encodeURIComponent(listing.item_id)}`}
                    >
                      {name(listing.ops_items)}
                    </a>{" "}
                    <span>
                      {listing.status === "ready"
                        ? "Ready to hand off"
                        : listing.status === "draft"
                          ? "Needs review"
                          : `Needs attention: ${listing.status}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>Unfinished photo sessions</h2>
            {summary.captures.length === 0 ? (
              <p>No open photo sessions.</p>
            ) : (
              <ul>
                {summary.captures.map((capture) => (
                  <li key={capture.item_id}>
                    <a
                      href={`/app/capture?itemId=${encodeURIComponent(capture.item_id)}`}
                    >
                      Continue {name(capture.ops_items)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
