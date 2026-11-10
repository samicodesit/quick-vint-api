import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { normalizeIncidentEvent } from "../../../utils/incidents/contract";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

// Real Chromium and callback DOM/script. Only external telemetry and auth are
// isolated: test-only session strings never leave this loopback server.
const enabled = process.env.RUN_AUTH_CALLBACK_BROWSER_TESTS === "1";
let server: Server;
let browser: any;
let base: string;

beforeAll(async () => {
  if (!enabled) return;
  const require = createRequire(
    join(
      process.env.AUTOLISTER_EXTENSION_PATH ||
        "/home/mests/projects/quick-vint",
      "package.json",
    ),
  );
  const { chromium } = require("@playwright/test");
  browser = await chromium.launch({ headless: true });
  const html = readFileSync("src/pages/auth/callback.html", "utf8");
  const script = readFileSync("public/auth-callback.js", "utf8");
  server = createServer((req, res) => {
    if (req.url === "/auth-callback.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(script);
    } else if (req.url?.startsWith("/auth/callback")) {
      res.setHeader("Content-Type", "text/html");
      res.end(html.replace(/<script src="\/telemetry-[^"]+"><\/script>/g, ""));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await browser?.close();
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

it.skipIf(!enabled)(
  "shows generic recovery guidance only when extension messaging is unavailable",
  async () => {
    const profiles = [
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      },
      {
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
      },
      {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
        ipad: true,
      },
    ];
    for (const profile of profiles) {
      const context = await browser.newContext({
        userAgent: profile.userAgent,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      });
      try {
        if (profile.ipad) {
          await context.addInitScript(() => {
            Object.defineProperty(navigator, "platform", { value: "MacIntel" });
          });
        }
        const page = await context.newPage();
        const externalRequests: string[] = [];
        await context.route("**/*", (route: any) => {
          if (route.request().url().startsWith(base)) return route.continue();
          externalRequests.push(route.request().url());
          return route.abort();
        });
        await page.goto(
          `${base}/auth/callback#access_token=local-test-access&refresh_token=local-test-refresh`,
          { waitUntil: "commit" },
        );
        await page.waitForFunction(() => {
          const status =
            document.getElementById("authCallbackStatus")?.textContent;
          return status && status !== "Opening the extension...";
        });
        expect(
          await page
            .locator("#authCallbackCopy")
            .textContent({ timeout: 2000 }),
        ).toMatch(/browser where you installed/i);
        expect(
          await page.locator("#authCallbackCopy").textContent(),
        ).not.toMatch(/Orion/i);
        expect(await page.locator("#authCallbackCopy").textContent()).toMatch(
          /new|fresh/i,
        );
        expect(await page.locator("#authCallbackCopy").textContent()).toMatch(
          /6-digit|six-digit/i,
        );
        expect(
          await page.locator("#authCallbackCard").getAttribute("data-state"),
        ).not.toBe("success");
        expect(new URL(page.url()).protocol).toBe("http:");
        expect(new URL(page.url()).hash).toBe("");
        expect(externalRequests).toEqual([]);
        const layout = await page
          .locator("#authCallbackCard")
          .evaluate((card: HTMLElement) => {
            const icon = card.querySelector(".mark");
            return {
              pageWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth,
              left: card.getBoundingClientRect().left,
              right: card.getBoundingClientRect().right,
              iconTransform: icon
                ? getComputedStyle(icon, "::before").transform
                : null,
            };
          });
        expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.left).toBeGreaterThanOrEqual(0);
        expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.iconTransform).toBe("none");
      } finally {
        await context.close();
      }
    }
  },
  30000,
);

it.skipIf(!enabled)(
  "keeps an immediately failed sign-in out of the watchdog when the terminal report arrives first",
  async () => {
    const context = await browser.newContext();
    const db = new PGlite();
    try {
      await context.route("**/*", (route: any) =>
        route.request().url().startsWith(base)
          ? route.continue()
          : route.abort(),
      );
      await context.addInitScript(() => {
        const events: string[] = [];
        const fixture = globalThis as any;
        fixture.callbackEvents = events;
        fixture.AutoListerWebsiteTelemetry = {
          track: (event: string) => events.push(event),
        };
      });
      const page = await context.newPage();
      await page.goto(
        `${base}/auth/callback#error=access_denied&error_code=otp_expired`,
      );
      expect(await page.locator("#authCallbackStatus").textContent()).toBe(
        "Sign-in link failed.",
      );
      const events: string[] = await page.evaluate(
        () => (globalThis as any).callbackEvents,
      );
      expect(events).toContain("auth_link_error");
      await db.exec(
        "CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated; " +
          "CREATE TABLE api_logs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid, user_email text, endpoint text, request_method text, response_status integer, user_agent text, origin text, ip_address text, full_request_body jsonb);",
      );
      await db.exec(
        readFileSync("migrations/2026-10-03_incident_tracking.sql", "utf8"),
      );
      const operationId = randomUUID();
      const occurredAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      // Recreate the production ordering: a terminal event overtakes a routine
      // checkpoint from the same callback with the same millisecond timestamp.
      for (const event of events.reverse()) {
        const input = normalizeIncidentEvent({
          event,
          source: "web_auth_callback",
          id: randomUUID(),
          occurredAt,
          context: { operationId, hasError: true },
        });
        expect(input.value).toBeDefined();
        await db.query("SELECT incident_ingest($1::jsonb, NULL, false)", [
          JSON.stringify(input.value),
        ]);
      }
      await db.query("SELECT incident_sweep(100)");
      expect(
        (await db.query("SELECT event FROM incident_groups ORDER BY event"))
          .rows,
      ).toEqual([{ event: "auth_link_error" }]);
    } finally {
      await context.close();
      await db.close();
    }
  },
  20000,
);
