import { useState } from "react";
import { callOps } from "../../gateway";

type Report = {
  from: string;
  to: string;
  allocationRule: string;
  currencies: Record<
    string,
    {
      revenueMinor: number;
      contributionMinor: number;
      completeOrders: number;
      incompleteOrders: number;
      distinctItems: number;
    }
  >;
  cohorts?: Array<{
    source: string;
    lot: string;
    currency: string;
    sellerRevenueMinor: number;
    distinctItems: number;
  }>;
  rows: Array<{
    orderId: string;
    createdAt: string;
    orderStatus: string;
    status: string;
    reason: string | null;
    currency: string | null;
    revenueMinor?: number;
    acquisitionMinor?: number;
    costsMinor?: number;
    contributionMinor: number | null;
    allocation?: Array<{ basis: string }>;
  }>;
};
export function Reports({
  client,
  workspaceId,
}: {
  client: any;
  workspaceId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState(""),
    [kind, setKind] = useState("seller_fee"),
    [amount, setAmount] = useState(""),
    [sourceKey, setSourceKey] = useState("");
  async function token() {
    return (await client.auth.getSession()).data.session?.access_token ?? "";
  }
  async function load() {
    setError("");
    setBusy(true);
    try {
      setReport(
        await callOps<Report>(fetch, await token(), {
          kind: "query",
          name: "report.build",
          workspaceId,
          payload: { from, to },
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not build report",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setError("");
    try {
      const result = await callOps<{ csv: string }>(fetch, await token(), {
        kind: "query",
        name: "report.export",
        workspaceId,
        payload: { from, to },
      });
      const url = URL.createObjectURL(
        new Blob([result.csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `autolister-contribution-${from}-${to}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not export report",
      );
    }
  }
  return (
    <div className="ops-reports">
      <p>
        Contribution uses seller revenue, known acquisition cost, seller costs
        and refunds. Buyer fees are excluded. Missing costs are shown as
        incomplete.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          From{" "}
          <input
            type="date"
            required
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            required
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button disabled={busy}>Build report</button>
      </form>
      {report && (
        <section>
          <h2>Contribution by currency</h2>
          <p>{report.allocationRule}</p>
          <button onClick={() => void download()}>Download matching CSV</button>
          {Object.entries(report.currencies).map(([currency, group]) => (
            <div key={currency}>
              <h3>{currency}</h3>
              <p>
                Complete orders: {group.completeOrders}. Incomplete orders:{" "}
                {group.incompleteOrders}. Distinct sold items:{" "}
                {group.distinctItems}.
              </p>
              <p>
                Known seller revenue: {(group.revenueMinor / 100).toFixed(2)}.
                Known contribution: {(group.contributionMinor / 100).toFixed(2)}
                .
              </p>
            </div>
          ))}
          <h2>Source and lot cohorts</h2>
          <p>
            Item counts are distinct physical garments. Seller revenue includes
            repeat sales after a return.
          </p>
          {(report.cohorts ?? []).map((cohort) => (
            <p key={`${cohort.source}:${cohort.lot}:${cohort.currency}`}>
              {cohort.source} / {cohort.lot}: {cohort.distinctItems} items,{" "}
              {cohort.currency} {(cohort.sellerRevenueMinor / 100).toFixed(2)}{" "}
              seller revenue.
            </p>
          ))}
          <div className="ops-report-table">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Currency</th>
                  <th>Seller revenue</th>
                  <th>Acquisition</th>
                  <th>Costs and refunds</th>
                  <th>Contribution</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.orderId}>
                    <td>{row.orderId.slice(0, 8)}</td>
                    <td>{row.currency ?? "Unknown"}</td>
                    <td>
                      {row.revenueMinor === undefined
                        ? "Unknown"
                        : (row.revenueMinor / 100).toFixed(2)}
                    </td>
                    <td>
                      {row.acquisitionMinor === undefined
                        ? "Unknown"
                        : (row.acquisitionMinor / 100).toFixed(2)}
                    </td>
                    <td>
                      {row.costsMinor === undefined
                        ? "Unknown"
                        : (row.costsMinor / 100).toFixed(2)}
                    </td>
                    <td>
                      {row.contributionMinor === null
                        ? "Incomplete"
                        : (row.contributionMinor / 100).toFixed(2)}
                    </td>
                    <td>
                      {row.reason ??
                        (row.allocation?.some(
                          (line) => line.basis === "equal_allocation",
                        )
                          ? "Allocated revenue"
                          : "Observed revenue")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {report && report.rows.length > 0 && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setBusy(true);
            try {
              const currency = report.rows.find(
                (row) => row.orderId === orderId,
              )?.currency;
              if (!currency)
                throw new Error("Choose an order with a known currency");
              await callOps(fetch, await token(), {
                kind: "command",
                name: "financial.observe",
                workspaceId,
                payload: {
                  orderId,
                  kind,
                  amountMinor: Math.round(Number(amount) * 100),
                  currency,
                  source: "manual",
                  sourceKey,
                  observedAt: new Date().toISOString(),
                },
                meta: {
                  idempotencyKey: crypto.randomUUID(),
                  expectedVersion: null,
                },
              });
              setAmount("");
              setSourceKey("");
              await load();
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Could not save cost",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Record a seller cost or refund observation</h2>
          <p>
            Use the same source key for the same receipt. This records evidence
            only and does not issue a refund.
          </p>
          <label>
            Order{" "}
            <select
              required
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Choose order</option>
              {report.rows.map((row) => (
                <option value={row.orderId} key={row.orderId}>
                  {row.orderId.slice(0, 8)} ({row.currency ?? "unknown"})
                </option>
              ))}
            </select>
          </label>
          <label>
            Kind{" "}
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="seller_fee">Seller fee</option>
              <option value="shipping">Shipping</option>
              <option value="packaging">Packaging</option>
              <option value="refund">Observed refund</option>
              <option value="adjustment_credit">Credit adjustment</option>
              <option value="adjustment_debit">Debit adjustment</option>
            </select>
          </label>
          <label>
            Amount in currency units{" "}
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Source key{" "}
            <input
              required
              maxLength={160}
              value={sourceKey}
              onChange={(event) => setSourceKey(event.target.value)}
            />
          </label>
          <button disabled={busy || !orderId}>Save observation</button>
        </form>
      )}
    </div>
  );
}
