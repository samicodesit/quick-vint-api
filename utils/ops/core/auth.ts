import { createClient } from "@supabase/supabase-js";
import {
  actorSchema,
  type Actor,
  type Role,
} from "../../../src/ops/contracts/core";

export type Identity = { userId: string; email: string | null };
export type AuthServices = {
  authenticate(token: string): Promise<Identity | null>;
  membership(userId: string, workspaceId: string): Promise<Role | null>;
  bootstrap(token: string, name: string, key: string): Promise<string>;
  listWorkspaces(
    userId: string,
  ): Promise<Array<{ workspaceId: string; role: Role; name: string }>>;
};

function config() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey)
    throw new Error("OS Supabase configuration is incomplete");
  return { url, serviceKey, anonKey };
}

export const defaultAuthServices: AuthServices = {
  async authenticate(token) {
    const { url, serviceKey } = config();
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser(token);
    return error || !data.user
      ? null
      : { userId: data.user.id, email: data.user.email ?? null };
  },
  async membership(userId, workspaceId) {
    const { url, serviceKey } = config();
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await client
      .from("ops_memberships")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    return (data?.role as Role | undefined) ?? null;
  },
  async bootstrap(token, name, key) {
    const { url, anonKey } = config();
    const client = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await client.rpc("ops_bootstrap_workspace", {
      p_name: name,
      p_key: key,
    });
    if (error) {
      if (error.code === "23505")
        throw Object.assign(new Error("Idempotency key conflict"), {
          opsCode: "CONFLICT",
        });
      throw error;
    }
    return String(data);
  },
  async listWorkspaces(userId) {
    const { url, serviceKey } = config();
    const client = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data: memberships, error } = await client
      .from("ops_memberships")
      .select("workspace_id,role")
      .eq("user_id", userId)
      .eq("active", true);
    if (error) throw error;
    if (!memberships?.length) return [];
    const ids = memberships.map((membership) => membership.workspace_id);
    const { data: workspaces, error: namesError } = await client
      .from("ops_workspaces")
      .select("id,name")
      .in("id", ids);
    if (namesError) throw namesError;
    const names = new Map(
      (workspaces ?? []).map((workspace) => [workspace.id, workspace.name]),
    );
    return memberships
      .filter((membership) => names.has(membership.workspace_id))
      .map((membership) => ({
        workspaceId: membership.workspace_id,
        role: membership.role as Role,
        name: names.get(membership.workspace_id)!,
      }));
  },
};

export async function resolveActor(
  sessionToken: string,
  workspaceId: string,
  services: AuthServices = defaultAuthServices,
): Promise<Actor | null> {
  const identity = await services.authenticate(sessionToken);
  if (!identity) return null;
  const role = await services.membership(identity.userId, workspaceId);
  if (!role) return null;
  return actorSchema.parse({ userId: identity.userId, workspaceId, role });
}
