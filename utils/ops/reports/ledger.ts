import { createClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  financialObservationSchema,
  reportQuerySchema,
} from "../../../src/ops/contracts/reports";
import { check, userClient } from "../inventory/intake";
import {
  calculateContribution,
  type Entry,
  type Line,
  type OrderSnapshot,
} from "./contribution";

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
export async function recordFinancialObservation(
  actor: Actor,
  input: z.infer<typeof financialObservationSchema>,
  meta: CommandMeta,
  token: string,
) {
  const value = financialObservationSchema.parse(input);
  const { data, error } = await userClient(token).rpc(
    "ops_record_financial_observation",
    {
      p_workspace_id: actor.workspaceId,
      p_order_id: value.orderId,
      p_kind: value.kind,
      p_amount_minor: value.amountMinor,
      p_currency: value.currency,
      p_source: value.source,
      p_source_key: value.sourceKey,
      p_observed_at: value.observedAt,
      p_key: meta.idempotencyKey,
    },
  );
  check(error);
  return data;
}
async function allRows(
  table:
    | "ops_orders"
    | "ops_order_lines"
    | "ops_financial_entries"
    | "ops_refund_observations"
    | "ops_items"
    | "ops_lots"
    | "ops_suppliers",
  workspaceId: string,
  columns: string,
  filters?: (query: any) => any,
): Promise<any[]> {
  const client = serviceClient();
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = client
      .from(table)
      .select(columns)
      .eq("workspace_id", workspaceId)
      .order("id")
      .range(offset, offset + 999);
    if (filters) query = filters(query);
    const { data, error } = await query;
    check(error);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    if (offset >= 100_000)
      throw new Error("Report too large for interactive export");
  }
  return rows;
}
export async function buildReport(
  actor: Actor,
  input: z.infer<typeof reportQuerySchema>,
) {
  if (!["owner", "manager"].includes(actor.role))
    throw Object.assign(new Error("Financial access denied"), {
      opsCode: "FORBIDDEN",
    });
  const value = reportQuerySchema.parse(input);
  const from = `${value.from}T00:00:00.000Z`,
    to = new Date(
      Date.parse(`${value.to}T00:00:00.000Z`) + 86400000,
    ).toISOString();
  const orders = await allRows(
    "ops_orders",
    actor.workspaceId,
    "id,status,currency,seller_total_minor,created_at",
    (query) => query.lt("created_at", to),
  );
  const lines = await allRows(
    "ops_order_lines",
    actor.workspaceId,
    "id,order_id,item_id,seller_revenue_minor,acquisition_cost_minor,acquisition_currency,acquisition_basis",
  );
  const entries = await allRows(
    "ops_financial_entries",
    actor.workspaceId,
    "id,order_id,kind,amount_minor,currency,source,source_key",
  );
  const refunds = await allRows(
    "ops_refund_observations",
    actor.workspaceId,
    "id,order_id,amount_minor,currency,source,source_key",
  );
  const [items, lots, suppliers] = await Promise.all([
    allRows("ops_items", actor.workspaceId, "id,lot_id,source_id"),
    allRows("ops_lots", actor.workspaceId, "id,name"),
    allRows("ops_suppliers", actor.workspaceId, "id,name"),
  ]);
  const byOrder = new Map<string, any[]>();
  for (const line of lines)
    byOrder.set(line.order_id, [...(byOrder.get(line.order_id) ?? []), line]);
  const entryByOrder = new Map<string, Entry[]>();
  for (const entry of entries)
    entryByOrder.set(entry.order_id, [
      ...(entryByOrder.get(entry.order_id) ?? []),
      {
        kind: entry.kind,
        amountMinor: Number(entry.amount_minor),
        currency: entry.currency,
        source: entry.source,
        sourceKey: entry.source_key,
      },
    ]);
  for (const refund of refunds) {
    if (refund.amount_minor === null || refund.currency === null) continue;
    const current = entryByOrder.get(refund.order_id) ?? [];
    if (
      !current.some(
        (entry) =>
          entry.kind === "refund" &&
          entry.source === refund.source &&
          entry.sourceKey === refund.source_key,
      )
    )
      current.push({
        kind: "refund",
        amountMinor: Number(refund.amount_minor),
        currency: refund.currency,
        source: refund.source,
        sourceKey: refund.source_key,
      });
    entryByOrder.set(refund.order_id, current);
  }
  const chargedItems = new Set<string>();
  const allCalculatedRows = orders
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .map((order) => {
      const snapshot: OrderSnapshot = {
        id: order.id,
        status: order.status,
        currency: order.currency,
        sellerTotalMinor:
          order.seller_total_minor === null
            ? null
            : Number(order.seller_total_minor),
        lines: (byOrder.get(order.id) ?? []).map(
          (line): Line => ({
            id: line.id,
            itemId: line.item_id,
            sellerRevenueMinor:
              line.seller_revenue_minor === null
                ? null
                : Number(line.seller_revenue_minor),
            acquisitionCostMinor:
              line.acquisition_cost_minor === null
                ? null
                : Number(line.acquisition_cost_minor),
            acquisitionCurrency: line.acquisition_currency,
            acquisitionBasis: line.acquisition_basis,
          }),
        ),
      };
      const calculation =
        order.status === "cancelled"
          ? {
              status: "incomplete" as const,
              reason: "cancelled",
              currency: order.currency,
              contributionMinor: null,
              allocation: null,
            }
          : calculateContribution(
              snapshot,
              entryByOrder.get(order.id) ?? [],
              chargedItems,
            );
      if (order.status !== "cancelled" && calculation.status === "complete")
        for (const line of snapshot.lines)
          if (line.itemId) chargedItems.add(line.itemId);
      return {
        orderId: order.id,
        createdAt: order.created_at,
        orderStatus: order.status,
        ...calculation,
      };
    });
  const rows = allCalculatedRows.filter((row) => row.createdAt >= from);
  const currencies: Record<
    string,
    {
      revenueMinor: number;
      contributionMinor: number;
      completeOrders: number;
      incompleteOrders: number;
      distinctItems: number;
    }
  > = {};
  const itemSets = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.currency) continue;
    const group = (currencies[row.currency] ??= {
      revenueMinor: 0,
      contributionMinor: 0,
      completeOrders: 0,
      incompleteOrders: 0,
      distinctItems: 0,
    });
    const items = itemSets.get(row.currency) ?? new Set<string>();
    itemSets.set(row.currency, items);
    for (const line of row.allocation ?? [])
      if (line.itemId) items.add(line.itemId);
    if (row.status === "complete") {
      group.revenueMinor += row.revenueMinor;
      group.contributionMinor += row.contributionMinor;
      group.completeOrders++;
    } else group.incompleteOrders++;
  }
  for (const [currency, items] of itemSets)
    currencies[currency].distinctItems = items.size;
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const lotMap = new Map(lots.map((lot) => [lot.id, lot.name]));
  const sourceMap = new Map(
    suppliers.map((source) => [source.id, source.name]),
  );
  const cohortMap = new Map<
    string,
    {
      source: string;
      lot: string;
      currency: string;
      sellerRevenueMinor: number;
      itemIds: Set<string>;
    }
  >();
  for (const row of rows) {
    if (!row.currency || row.orderStatus === "cancelled") continue;
    for (const line of row.allocation ?? []) {
      if (!line.itemId) continue;
      const item = itemMap.get(line.itemId);
      const source = sourceMap.get(item?.source_id) ?? "Unknown source";
      const lot = lotMap.get(item?.lot_id) ?? "No lot";
      const key = JSON.stringify([source, lot, row.currency]);
      const cohort = cohortMap.get(key) ?? {
        source,
        lot,
        currency: row.currency,
        sellerRevenueMinor: 0,
        itemIds: new Set<string>(),
      };
      cohort.sellerRevenueMinor += line.revenueMinor;
      cohort.itemIds.add(line.itemId);
      cohortMap.set(key, cohort);
    }
  }
  const cohorts = [...cohortMap.values()].map((cohort) => ({
    source: cohort.source,
    lot: cohort.lot,
    currency: cohort.currency,
    sellerRevenueMinor: cohort.sellerRevenueMinor,
    distinctItems: cohort.itemIds.size,
  }));
  return {
    from: value.from,
    to: value.to,
    allocationRule:
      "Observed line revenue when present; remaining seller total allocated equally by line ID with remainder to earliest IDs. Buyer fees excluded.",
    currencies,
    cohorts,
    rows,
  };
}
export function exportReportCsv(
  report: Awaited<ReturnType<typeof buildReport>>,
) {
  const quote = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  return (
    [
      "order_id,created_at,status,currency,seller_revenue_minor,acquisition_minor,costs_and_refunds_minor,contribution_minor,coverage,revenue_basis",
      ...report.rows.map((row) =>
        [
          row.orderId,
          row.createdAt,
          row.orderStatus,
          row.currency,
          row.status === "complete" ? row.revenueMinor : "",
          row.status === "complete" ? row.acquisitionMinor : "",
          row.status === "complete" ? row.costsMinor : "",
          row.contributionMinor ?? "",
          row.status,
          row.allocation?.some((line) => line.basis === "equal_allocation")
            ? "equal_allocation"
            : "observed",
        ]
          .map(quote)
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
