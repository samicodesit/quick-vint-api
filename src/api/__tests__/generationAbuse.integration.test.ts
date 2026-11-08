import { PGlite } from "@electric-sql/pglite";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as PGlite | null,
  providerCalls: 0,
  beforePause: null as null | (() => Promise<void>),
}));
const newUser = "00000000-0000-4000-8000-000000000001";
const oldUser = "00000000-0000-4000-8000-000000000002";

vi.mock("openai", () => ({
  OpenAI: class {
    chat = {
      completions: {
        create: () => {
          state.providerCalls += 1;
          throw new Error(
            "Abuse checks must finish before any provider request",
          );
        },
      },
    };
  },
}));

// Only the hosted PostgREST/auth boundary is replaced. The actual generation
// handler, IP extraction, duplicate-account detection and pause updates run.
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: async (token: string) => ({
        data: {
          user:
            token === "local-account"
              ? {
                  id: "00000000-0000-4000-8000-000000000001",
                  email: "seller@example.com",
                }
              : null,
        },
      }),
    },
    from: (table: string) => {
      if (!["profiles", "api_logs"].includes(table))
        throw new Error(`Unexpected abuse-test table: ${table}`);
      const values: unknown[] = [];
      const filters: string[] = [];
      const orFilters: string[] = [];
      let selectedColumns = "*";
      let patch: Record<string, unknown> | undefined;
      let order = "";
      let limit = "";
      function column(name: string) {
        if (!/^[a-z_]+$/.test(name)) throw new Error("Unsafe fixture column");
        return name;
      }
      function filter(name: string, op: string, value: unknown) {
        values.push(value);
        filters.push(`${column(name)} ${op} $${values.length}`);
        return query;
      }
      async function run(single = false) {
        const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
        let sql = `SELECT * FROM ${table}${where}${order}${limit}`;
        const args = [...values];
        if (patch) {
          if (patch.account_status === "paused" && state.beforePause) {
            const applyPayment = state.beforePause;
            state.beforePause = null;
            await applyPayment();
          }
          const assignments = Object.entries(patch).map(([key, value]) => {
            args.push(value);
            return `${column(key)} = $${args.length}`;
          });
          // Hosted PostgREST also applies OR filters to the returned rows.
          // PostgreSQL rejects this query if an OR column is missing from RETURNING.
          const returning =
            selectedColumns === "*"
              ? "*"
              : selectedColumns
                  .split(",")
                  .map((name) => column(name.trim()))
                  .join(",");
          const outerWhere = orFilters.length
            ? ` WHERE ${orFilters.join(" AND ")}`
            : "";
          sql = `WITH pgrst_source AS (
            UPDATE ${table} SET ${assignments.join(",")}${where} RETURNING ${returning}
          ) SELECT * FROM pgrst_source AS ${table}${outerWhere}`;
        }
        try {
          const result = await state.db!.query(sql, args);
          return {
            data: single ? result.rows[0] || null : result.rows,
            error: null,
          };
        } catch (error) {
          if (!patch) throw error;
          return { data: null, error };
        }
      }
      const query = {
        select: (columns = "*") => {
          selectedColumns = columns;
          return query;
        },
        or: (expression: string) => {
          const match = expression.match(
            /^([a-z_]+)\.is\.null,\1\.(lte|not\.in)\.(.+)$/,
          );
          if (!match) throw new Error("Unsupported fixture OR: " + expression);
          const name = column(match[1]);
          if (match[2] === "lte") {
            values.push(match[3]);
            filters.push(`(${name} IS NULL OR ${name} <= $${values.length})`);
          } else {
            const list = match[3].slice(1, -1).split(",");
            const placeholders = list.map((value) => {
              values.push(value);
              return `$${values.length}`;
            });
            filters.push(
              `(${name} IS NULL OR ${name} NOT IN (${placeholders.join(",")}))`,
            );
          }
          orFilters.push(filters[filters.length - 1]);
          return query;
        },
        eq: (name: string, value: unknown) => filter(name, "=", value),
        neq: (name: string, value: unknown) => filter(name, "<>", value),
        gte: (name: string, value: unknown) => filter(name, ">=", value),
        in: (name: string, ids: string[]) => {
          const placeholders = ids.map((id) => {
            values.push(id);
            return `$${values.length}`;
          });
          filters.push(`${column(name)} IN (${placeholders.join(",")})`);
          return query;
        },
        order: (name: string, options: { ascending: boolean }) => {
          order = ` ORDER BY ${column(name)} ${options.ascending ? "ASC" : "DESC"}`;
          return query;
        },
        limit: (count: number) => {
          if (!Number.isInteger(count) || count < 0)
            throw new Error("Bad limit");
          limit = ` LIMIT ${count}`;
          return query;
        },
        update: (data: Record<string, unknown>) => {
          patch = data;
          return query;
        },
        single: () => run(true),
        maybeSingle: () => run(true),
        then: (
          resolve: (result: unknown) => unknown,
          reject: (error: unknown) => unknown,
        ) => run().then(resolve, reject),
      };
      return query;
    },
  },
}));

import handler from "../../../api/generate";
import { ApiLogger } from "../../../utils/apiLogger";
import { RateLimiter } from "../../../utils/rateLimiter";

let server: Server;
let origin: string;
const log = vi.spyOn(ApiLogger, "logRequest").mockResolvedValue(undefined);
const reserve = vi.spyOn(RateLimiter, "reserveGenerationRequest");

beforeAll(async () => {
  vi.stubEnv("MOBILE_WEB_APP_ENABLED", "true");
  vi.stubEnv("VERCEL_APP_OPENAI_API_KEY", "fixture-never-used");
  state.db = new PGlite();
  await state.db.exec(`
    CREATE TABLE profiles (
      id uuid PRIMARY KEY, email text, subscription_status text DEFAULT 'free',
      subscription_tier text DEFAULT 'free', account_status text DEFAULT 'active',
      free_lifetime_generations_used integer DEFAULT 0, api_calls_this_month integer DEFAULT 0,
      paid_access_expires_at timestamptz, pack_credits integer DEFAULT 0, last_api_call_reset timestamptz DEFAULT now(),
      is_legacy_plan boolean DEFAULT false, ai_instructions text, abuse_reason text,
      abuse_notes text, paused_at timestamptz, paused_by text
    );
    CREATE TABLE api_logs (
      user_id uuid, user_email text, ip_address text, endpoint text,
      response_status integer, flagged_reason text, full_request_body jsonb,
      created_at timestamptz DEFAULT now()
    );
  `);
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const response = Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return response;
      },
      json(body: unknown) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
        return response;
      },
    });
    try {
      await handler(
        Object.assign(req, {
          body: JSON.parse(Buffer.concat(chunks).toString()),
        }) as any,
        response as any,
      );
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});

beforeEach(async () => {
  state.providerCalls = 0;
  log.mockClear();
  reserve.mockClear();
  await state.db!.exec("TRUNCATE profiles, api_logs");
  await state.db!.query(
    "INSERT INTO profiles(id,email,free_lifetime_generations_used) VALUES ($1,'seller@example.com',0),($2,'prior@example.com',5)",
    [newUser, oldUser],
  );
  await state.db!.query(
    "INSERT INTO api_logs(user_id,user_email,ip_address,endpoint,response_status) VALUES ($1,'prior@example.com','203.0.113.9','/api/generate',200)",
    [oldUser],
  );
});

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await state.db?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function request(
  client: string | null,
  ip = "203.0.113.9",
  mode = "manual",
) {
  return fetch(`${origin}/api/generate`, {
    method: "POST",
    headers: {
      authorization: "Bearer local-account",
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      ...(client ? { "x-autolister-client": client } : {}),
      "x-autolister-request-id": randomUUID(),
    },
    // Empty photos intentionally stop allowed controls at input validation,
    // before any AI call or credit reservation can occur.
    body: JSON.stringify({ imageUrls: [], generationMode: mode }),
  });
}

it.each(["mobile_web", "extension", null])(
  "auto-pauses duplicate exhausted free usage through real HTTP and SQL for %s",
  async (client) => {
    const result = await request(client);
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({
      code: "account_paused",
      allowed: false,
      available: 0,
      abuseReason: "duplicate_ip_signup",
    });
    const row = await state.db!.query("SELECT * FROM profiles WHERE id=$1", [
      newUser,
    ]);
    expect(row.rows[0]).toMatchObject({
      account_status: "paused",
      abuse_reason: "duplicate_ip_signup",
      paused_by: "system_ip_match",
      free_lifetime_generations_used: 0,
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/system/auto-pause-duplicate-ip",
        responseStatus: 200,
      }),
    );
    expect(reserve).not.toHaveBeenCalled();
    expect(state.providerCalls).toBe(0);
  },
);

it.each(["manual", "batch", "phone_upload"])(
  "switching headers and IP cannot bypass an existing pause in %s mode",
  async (mode) => {
    expect((await request("mobile_web")).status).toBe(403);
    for (const client of ["mobile_web", "extension", null, "unknown"]) {
      const result = await request(client, "203.0.113.50", mode);
      expect(result.status).toBe(403);
      expect(await result.json()).toMatchObject({ code: "account_paused" });
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(state.providerCalls).toBe(0);
  },
);

it("negative control: another IP passes the guard and reaches input validation", async () => {
  const result = await request("mobile_web", "203.0.113.50");
  expect(result.status).toBe(400);
  expect(await result.json()).toMatchObject({
    error: "imageUrls must be a non-empty array of strings.",
  });
  const row = await state.db!.query<{ account_status: string }>(
    "SELECT account_status FROM profiles WHERE id=$1",
    [newUser],
  );
  expect(row.rows[0].account_status).toBe("active");
  expect(reserve).not.toHaveBeenCalled();
});

it("sharing an IP alone does not pause another unused free account", async () => {
  await state.db!.query(
    "UPDATE profiles SET free_lifetime_generations_used=0 WHERE id=$1",
    [oldUser],
  );
  expect((await request("mobile_web")).status).toBe(400);
  const row = await state.db!.query<{ account_status: string }>(
    "SELECT account_status FROM profiles WHERE id=$1",
    [newUser],
  );
  expect(row.rows[0].account_status).toBe("active");
});

it("hands off to the quota without running the legacy account pause", async () => {
  vi.stubEnv("FREE_TRIAL_IP_QUOTA_ENABLED", "true");
  try {
    expect((await request("mobile_web")).status).toBe(400);
    const row = await state.db!.query(
      "SELECT account_status FROM profiles WHERE id=$1",
      [newUser],
    );
    expect(row.rows[0]).toMatchObject({ account_status: "active" });
  } finally {
    delete process.env.FREE_TRIAL_IP_QUOTA_ENABLED;
  }
});

it("paid entitlement keeps the existing exemption from duplicate free-trial checks", async () => {
  await state.db!.query(
    "UPDATE profiles SET subscription_status='active',subscription_tier='starter' WHERE id=$1",
    [newUser],
  );
  expect((await request("mobile_web")).status).toBe(400);
  const row = await state.db!.query<{ account_status: string }>(
    "SELECT account_status FROM profiles WHERE id=$1",
    [newUser],
  );
  expect(row.rows[0].account_status).toBe("active");
});

it.each(["pack", "subscription", "paid_access"])(
  "a concurrent %s payment prevents a stale pause write",
  async (kind) => {
    state.beforePause = async () => {
      const patch =
        kind === "pack"
          ? "pack_credits=20"
          : kind === "subscription"
            ? "subscription_status='active'"
            : "paid_access_expires_at=now()+interval '1 day'";
      await state.db!.query(`UPDATE profiles SET ${patch} WHERE id=$1`, [
        newUser,
      ]);
    };
    expect((await request("mobile_web")).status).toBe(400);
    const result = await state.db!.query(
      "SELECT account_status FROM profiles WHERE id=$1",
      [newUser],
    );
    expect(result.rows[0]).toMatchObject({ account_status: "active" });
    expect(log).not.toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/system/auto-pause-duplicate-ip" }),
    );
    expect(state.providerCalls).toBe(0);
  },
);
it("purchased credits stay usable on the same IP", async () => {
  await state.db!.query("UPDATE profiles SET pack_credits=20 WHERE id=$1", [
    newUser,
  ]);
  expect((await request("extension")).status).toBe(400);
  const result = await state.db!.query(
    "SELECT account_status, pack_credits FROM profiles WHERE id=$1",
    [newUser],
  );
  expect(result.rows[0]).toMatchObject({
    account_status: "active",
    pack_credits: 20,
  });
});
