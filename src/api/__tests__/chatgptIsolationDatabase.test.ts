import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
it("keeps normal sessions unchanged and denies delegated tokens the database role", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role authenticator nologin noinherit; create role supabase_auth_admin;",
    );
    await db.exec(
      await readFile(
        "migrations/2026-11-01_chatgpt_oauth_isolation.sql",
        "utf8",
      ),
    );
    const ordinary = {
      sub: "alice",
      role: "authenticated",
      aud: "authenticated",
      extra: "preserve",
    };
    const normal = await db.query<{ out: { claims: unknown } }>(
      "select public.autolister_oauth_token_hook($1::jsonb) as out",
      [JSON.stringify({ claims: ordinary })],
    );
    expect(normal.rows[0].out.claims).toEqual(ordinary);
    const delegated = await db.query<{
      out: { claims: { role: string; autolister_resource: string } };
    }>("select public.autolister_oauth_token_hook($1::jsonb) as out", [
      JSON.stringify({ claims: { ...ordinary, client_id: "chatgpt" } }),
    ]);
    expect(delegated.rows[0].out.claims.role).toBe("autolister_plugin");
    expect(delegated.rows[0].out.claims.autolister_resource).toBe(
      "https://autolister.app/api/chatgpt/mcp",
    );
    await db.exec("set session authorization authenticator;");
    await expect(db.exec("set role autolister_plugin")).rejects.toThrow(
      /permission denied/,
    );
  } finally {
    await db.close();
  }
}, 30000);
