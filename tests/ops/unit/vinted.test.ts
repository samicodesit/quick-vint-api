import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  VintedClient,
  parseVintedJson,
} from "../../../utils/ops/integrations/vinted/client";
import { createItems } from "../../../utils/ops/integrations/vinted/items";
import { normalizeOrder } from "../../../utils/ops/integrations/vinted/orders";
import { reconcilePublication } from "../../../utils/ops/integrations/vinted/reconcile";
import { decodeVintedWebhook } from "../../../utils/ops/integrations/vinted/webhooks";
import {
  signVintedRequest,
  verifyVintedWebhook,
} from "../../../utils/ops/integrations/vinted/signing";

describe("official Vinted contract v0.360.0", () => {
  it("signs the documented request payload with HMAC-SHA256", () => {
    expect(
      signVintedRequest(
        { accessKey: "foo", signingKey: "bar" },
        "POST",
        "/api/v1/webhooks",
        '{ "event_types": ["CREATE_ITEM_SUCCESS"], "url": "https://example.com" }',
        1704067200,
      ),
    ).toBe(
      "t=1704067200,v1=f44e2802ed67d70b433a7f04d1a147a0ff459fb86f12f805c70bc09ba5d2b620",
    );
  });

  it("rejects bad, stale and modified raw webhook bodies", () => {
    const body = new TextEncoder().encode(
      '{"webhook_id":"11111111-1111-1111-1111-111111111111","event_type":"ITEM_SOLD","event_data":{"item_id":"x"}}',
    );
    const timestamp = 1704067200;
    const hash = createHmac("sha256", "secret")
      .update(`${timestamp}.`)
      .update(body)
      .digest("hex");
    const signature = `t=${timestamp},v1=${hash}`;
    expect(
      verifyVintedWebhook("secret", body, signature, timestamp).valid,
    ).toBe(true);
    expect(verifyVintedWebhook("wrong", body, signature, timestamp).valid).toBe(
      false,
    );
    expect(
      verifyVintedWebhook("secret", body, signature, timestamp + 301).valid,
    ).toBe(false);
    expect(
      verifyVintedWebhook(
        "secret",
        new TextEncoder().encode(new TextDecoder().decode(body) + " "),
        signature,
        timestamp,
      ).valid,
    ).toBe(false);
    expect(
      decodeVintedWebhook(
        body,
        signature,
        "11111111-1111-1111-1111-111111111111",
        "secret",
        timestamp,
      ).eventType,
    ).toBe("ITEM_SOLD");
    expect(() =>
      decodeVintedWebhook(
        body,
        signature,
        "22222222-2222-2222-2222-222222222222",
        "secret",
        timestamp,
      ),
    ).toThrow();
  });

  it("retains integer order IDs beyond JavaScript safe precision", () => {
    const data = parseVintedJson(
      '{"id":9223372036854775807,"amount":12.5,"items":[]}',
    ) as { id: string; amount: number };
    expect(data.id).toBe("9223372036854775807");
    expect(data.amount).toBe(12.5);
    expect(
      normalizeOrder({
        id: data.id,
        status: "UNMAPPED",
        items: [
          {
            id: "00000000-0000-0000-0000-000000000000",
            title: "Legacy",
            price: 12.5,
          },
        ],
        currency: "EUR",
      }).eligibleForFulfillment,
    ).toBe(false);
  });

  it("uses sandbox host and signed raw request path", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('{"orders":[]}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new VintedClient(
      { accessKey: "foo", signingKey: "bar" },
      "sandbox",
      fetcher as typeof fetch,
      () => 1704067200000,
    );
    await client.request("GET", "/api/v1/orders?after-id=9223372036854775807");
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://pro-public-sandbox.svc.vinted.com/api/v1/orders?after-id=9223372036854775807",
    );
    expect(
      (init.headers as Record<string, string>)["X-Vpi-Hmac-Sha256"],
    ).toContain("t=1704067200,v1=");
  });

  it("refuses slot overflow and ontology drift before sending", async () => {
    const request = vi.fn();
    const client = { request } as unknown as VintedClient;
    const item = {
      item_reference: "SKU-1",
      title: "Blue jacket",
      description: "Blue jacket in good condition",
      photo_urls: ["https://example.com/a.jpg"],
      currency: "EUR",
      price: 12,
      catalog_id: 1,
      brand: "Example",
      package_size_id: 2,
      item_attributes: [],
    };
    const ontology = {
      version: "v1",
      hash: "abc",
      payload: {
        enumerations: { catalogs: [{ id: 1 }], package_sizes: [{ id: 2 }] },
      },
    };
    await expect(
      createItems(client, [item], "old", ontology, { active: 0, limit: 1 }),
    ).rejects.toThrow("ontology changed");
    await expect(
      createItems(client, [item], "v1", ontology, { active: 1, limit: 1 }),
    ).rejects.toThrow("slots");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue({
      status: 202,
      data: {
        items: [
          {
            item_id: "11111111-1111-1111-1111-111111111111",
            item_reference: "SKU-1",
          },
        ],
      },
    });
    expect(
      await createItems(client, [item], "v1", ontology, {
        active: 0,
        limit: 1,
      }),
    ).toHaveLength(1);
  });

  it("treats an accepted create as pending and resolves uncertain state by reference", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, data: { items: [] } })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [
            {
              item_id: "11111111-1111-1111-1111-111111111111",
              item_reference: "SKU-1",
            },
          ],
        },
      })
      .mockResolvedValueOnce({ status: 200, data: { status: "ACTIVE" } });
    const client = { request } as unknown as VintedClient;
    expect((await reconcilePublication(client, "SKU-1")).state).toBe(
      "uncertain",
    );
    expect((await reconcilePublication(client, "SKU-1")).state).toBe("live");
  });
});
