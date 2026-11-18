import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { OpenAI } from "openai";

it("preserves actual SDK request bodies, response metadata and bounded retries over local HTTP", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  let receivedAbort: () => void;
  const abortStarted = new Promise<void>((resolve) => {
    receivedAbort = resolve;
  });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ path: request.url!, body });
    if (body.model === "controlled-abort") {
      receivedAbort();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.setHeader("x-request-id", "local-sdk-request");
    if (["controlled-failure", "controlled-auth"].includes(body.model)) {
      response.writeHead(body.model === "controlled-auth" ? 401 : 503);
      response.end(
        JSON.stringify({
          error: {
            message: "Controlled provider failure",
            type: "server_error",
          },
        }),
      );
    } else {
      response.end(
        JSON.stringify(
          request.url === "/v1/responses"
            ? {
                id: "local-response",
                status: "completed",
                output: [],
                usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
              }
            : {
                id: "local-chat",
                choices: [{ message: { content: "fixture" } }],
                usage: {
                  prompt_tokens: 3,
                  completion_tokens: 2,
                  total_tokens: 5,
                },
              },
        ),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = new OpenAI({
      apiKey: "local-fixture-only",
      baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    });
    const chatBody = {
      model: "local-chat-model",
      messages: [{ role: "user" as const, content: "fixture" }],
    };
    const chat = await client.chat.completions.create(chatBody).withResponse();
    expect(chat.response.status).toBe(200);
    expect(chat.response.headers.get("x-request-id")).toBe("local-sdk-request");
    expect(chat.data.usage?.total_tokens).toBe(5);
    expect(calls[0]).toEqual({ path: "/v1/chat/completions", body: chatBody });
    const pilotBody = {
      model: "local-pilot",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: "data:image/jpeg;base64,AA==",
              detail: "low",
            },
            {
              type: "input_image",
              image_url: "https://images.example.invalid/photo.jpg",
              detail: "low",
            },
          ],
        },
      ],
      store: false,
      prompt_cache_options: { mode: "explicit" },
    };
    const pilot = await client
      .post<{
        id: string;
        usage: { total_tokens: number };
      }>("/responses", { body: pilotBody })
      .withResponse();
    expect(pilot.data.id).toBe("local-response");
    expect(pilot.data.usage.total_tokens).toBe(5);
    expect(pilot.response.headers.get("x-request-id")).toBe(
      "local-sdk-request",
    );
    expect(calls[1]).toEqual({ path: "/v1/responses", body: pilotBody });
    await expect(
      client.chat.completions.create({
        ...chatBody,
        model: "controlled-failure",
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      calls.filter((call) => call.body.model === "controlled-failure"),
    ).toHaveLength(3);
    expect(client.maxRetries).toBe(2);
    expect(client.timeout).toBe(600000);
    await expect(
      client.chat.completions.create({ ...chatBody, model: "controlled-auth" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      calls.filter((call) => call.body.model === "controlled-auth"),
    ).toHaveLength(1);
    const controller = new AbortController();
    const aborted = expect(
      client.chat.completions.create(
        { ...chatBody, model: "controlled-abort" },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(OpenAI.APIUserAbortError);
    await abortStarted;
    controller.abort();
    await aborted;
    expect(
      calls.filter((call) => call.body.model === "controlled-abort"),
    ).toHaveLength(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
