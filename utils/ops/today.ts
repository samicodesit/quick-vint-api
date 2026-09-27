import { createClient } from "@supabase/supabase-js";
import type { Actor } from "../../src/ops/contracts/core";
import { check } from "./inventory/intake";

export type TodayOrder = {
  id: string;
  status: string;
  created_at: string;
  ship_by_at: string | null;
};

const orderPriority: Record<string, number> = {
  unknown: 0,
  packed: 1,
  picking: 2,
  reserved: 3,
  confirmed: 4,
};

export function sortTodayOrders<T extends TodayOrder>(orders: T[]): T[] {
  return [...orders].sort((left, right) => {
    const leftDue = left.ship_by_at ? Date.parse(left.ship_by_at) : Infinity;
    const rightDue = right.ship_by_at ? Date.parse(right.ship_by_at) : Infinity;
    return (
      leftDue - rightDue ||
      (orderPriority[left.status] ?? 9) - (orderPriority[right.status] ?? 9) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id)
    );
  });
}

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function todaySummary(actor: Actor) {
  const client = serviceClient();
  const [orders, listings, captures, issues, exceptions, connections] =
    await Promise.all([
      client
        .from("ops_orders")
        .select("id,status,created_at,ship_by_at")
        .eq("workspace_id", actor.workspaceId)
        .in("status", ["unknown", "confirmed", "reserved", "picking", "packed"])
        .order("ship_by_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(100),
      client
        .from("ops_listings")
        .select(
          "item_id,status,updated_at,ops_items(display_sku,catalog_title)",
        )
        .eq("workspace_id", actor.workspaceId)
        .in("status", ["draft", "ready", "failed", "uncertain"])
        .order("updated_at", { ascending: false })
        .limit(50),
      client
        .from("ops_capture_sessions")
        .select("id,item_id,created_at,ops_items(display_sku,catalog_title)")
        .eq("workspace_id", actor.workspaceId)
        .eq("state", "open")
        .order("created_at", { ascending: true })
        .limit(50),
      client
        .from("ops_order_issues")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", actor.workspaceId)
        .is("resolved_at", null),
      client
        .from("ops_exceptions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", actor.workspaceId)
        .is("resolved_at", null),
      ["owner", "manager"].includes(actor.role)
        ? client
            .from("ops_vinted_connections")
            .select("verified_at,last_reconciled_at,read_orders_verified")
            .eq("workspace_id", actor.workspaceId)
            .eq("environment", "production")
            .order("created_at", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
  for (const result of [
    orders,
    listings,
    captures,
    issues,
    exceptions,
    connections,
  ])
    check(result.error);
  return {
    orders: sortTodayOrders((orders.data ?? []) as TodayOrder[]).slice(0, 20),
    listings: ["warehouse"].includes(actor.role)
      ? []
      : (listings.data ?? []).slice(0, 20),
    captures: (captures.data ?? []).slice(0, 20),
    problems: (issues.count ?? 0) + (exceptions.count ?? 0),
    connection: ["owner", "manager"].includes(actor.role)
      ? (connections.data?.[0] ?? null)
      : null,
  };
}
