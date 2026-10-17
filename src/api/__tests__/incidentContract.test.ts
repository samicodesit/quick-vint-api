import { describe, expect, it } from "vitest";
import {
  normalizeIncidentEvent,
  classifyEvent,
  redact,
  sanitizeContext,
} from "../../../utils/incidents/contract";

const now = Date.parse("2026-10-03T10:00:00Z");
const event = {
  id: "a423926a-35a6-4bf5-8027-8ab335c71110",
  occurredAt: "2026-10-03T09:59:00Z",
  event: "generate_error",
  source: "extension_content",
  context: { generationAttemptId: "attempt-1", errorCode: "NETWORK_ERROR" },
};

describe("incident ingestion contract", () => {
  const browserMessages = [
    [
      "TypeError",
      "TypeError: undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
    ],
    [
      "TypeError",
      "TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')",
    ],
    ["ReferenceError", "ReferenceError: Can't find variable: __firefox__"],
  ];
  const phoneException = (errorName: string, message: string) => ({
    ...event,
    event: "own_context_exception",
    source: "phone_upload_page",
    context: { errorName, message, stack: "global code@[url]" },
  });

  it.each(browserMessages)(
    "retains the exact injected %s signature as a separate warning (%s)",
    (name, message) => {
      const result = normalizeIncidentEvent(
        phoneException(name, message),
        now,
      ).value!;
      expect(result.event).toBe("browser_script_exception");
      expect(result.definition).toMatchObject({
        kind: "incident",
        severity: "warning",
        stage: "browser_script",
      });
      expect(result.context).toMatchObject({
        errorName: name,
        message,
        stack: "global code@[url]",
      });
      expect(result.fingerprint).not.toBe(
        normalizeIncidentEvent(
          phoneException("TypeError", "Cannot read upload state"),
          now,
        ).value!.fingerprint,
      );
    },
  );

  it("keeps ambiguous, named app-frame and other-source errors blocking", () => {
    const input = phoneException(...(browserMessages[0] as [string, string]));
    for (const change of [
      { context: { ...input.context, stack: "" } },
      {
        context: {
          ...input.context,
          stack: "upload@https://autolister.app/phone-upload:450:3",
        },
      },
      {
        context: { ...input.context, stack: "global code@[url]\nupload@[url]" },
      },
      { context: { ...input.context, message: "Cannot read upload state" } },
      { context: { ...input.context, errorCode: "UPLOAD_FAILED" } },
      { context: { ...input.context, errorName: "UploadError" } },
      { source: "extension_content" },
      { source: "backend" },
    ]) {
      const result = normalizeIncidentEvent(
        { ...input, ...change },
        now,
      ).value!;
      expect(result.event).toBe("own_context_exception");
      expect(result.definition.severity).toBe("blocking");
    }
  });

  it("retains bounded registered drop types without accepting caller text", () => {
    const types = {
      token_refresh_failed: 100,
      generate_error: 2,
      phone_upload_inject_error: 1,
      listing_report_submitted: 1,
      other: 4,
    };
    expect(
      sanitizeContext({ queueDroppedEventTypes: JSON.stringify(types) }, false)
        .queueDroppedEventTypes,
    ).toBe(JSON.stringify(types));
    for (const value of [
      '{"private_name":1}',
      '{"generate_error":"secret"}',
      '{"generate_error":-1}',
      "invalid",
    ]) {
      expect(
        sanitizeContext({ queueDroppedEventTypes: value }, false),
      ).not.toHaveProperty("queueDroppedEventTypes");
    }
  });
  it("retains legacy provider codes and numeric HTTP status as canonical diagnostics", () => {
    const result = normalizeIncidentEvent(
      {
        ...event,
        context: {
          code: "provider_unavailable",
          status: 503,
          message: "Service unavailable",
          phase: "refresh_session",
          stage: "authenticating",
          elapsedMs: 6000,
          attempts: 3,
        },
      },
      now,
    );
    expect(result.value?.context).toMatchObject({
      errorCode: "provider_unavailable",
      statusCode: 503,
      phase: "refresh_session",
      stage: "authenticating",
      elapsedMs: 6000,
      attempts: 3,
    });
    expect(result.value?.context.code).toBeUndefined();
  });

  it("keeps canonical authentication and credit-limit statuses quiet", () => {
    for (const statusCode of [401, 402]) {
      const result = normalizeIncidentEvent(
        { ...event, context: { statusCode } },
        now,
      );
      expect(result.value?.definition.kind).toBe("expected");
    }
  });

  it("keeps field comparison diagnostics without recording field contents", () => {
    const context = {
      titleFieldPresent: true,
      descriptionFieldPresent: true,
      titleMatches: true,
      descriptionMatches: false,
      expectedTitleLength: 17,
      actualTitleLength: 17,
      expectedDescriptionLength: 30,
      actualDescriptionLength: 0,
      documentVisible: true,
      elapsedMs: 2500,
    };
    const result = normalizeIncidentEvent(
      {
        ...event,
        event: "fields_apply_failed",
        context: {
          ...context,
          actualTitle: "private title",
          actualDescription: "private description",
        },
      },
      now,
    );
    expect(result.value?.context).toMatchObject(context);
    expect(JSON.stringify(result.value)).not.toContain("private");
  });
  it("classifies explicit outcomes without guessing from suffixes", () => {
    expect(classifyEvent("generate_error").kind).toBe("incident");
    expect(classifyEvent("generate_limit_hit").kind).toBe("expected");
    expect(classifyEvent("generate_success").stage).toBe("generation_received");
    expect(classifyEvent("unknown_error").kind).toBe("business");
  });

  it("removes claimed identity, descriptions, raw links and unrelated context", () => {
    const result = normalizeIncidentEvent(
      {
        ...event,
        userId: "forged",
        context: {
          ...event.context,
          userId: "forged",
          generatedDescription: "private listing",
          sessionId: "secret-phone-session",
          token: "secret-token",
          html: "<body>private</body>",
          message:
            "Failed https://autolister.app/phone-upload?session=secret bearer abc.def.xyz seller@example.com",
        },
      },
      now,
    );
    expect(result.error).toBeUndefined();
    const stored = JSON.stringify(result.value);
    for (const secret of [
      "forged",
      "private listing",
      "secret-phone-session",
      "secret-token",
      "abc.def.xyz",
      "seller@example.com",
    ]) {
      expect(stored).not.toContain(secret);
    }
    expect(result.value?.context.generationAttemptId).toBe("attempt-1");
  });

  it("retains bounded photo diagnostics without image URLs or file names", () => {
    const result = normalizeIncidentEvent(
      {
        ...event,
        context: {
          phase: "fetch",
          navigatorOnline: true,
          requestBodyImageCount: 4,
          imageSources: Array.from({ length: 20 }, () => ({
            index: 1,
            sourceKind: "blob_url",
            domNaturalWidth: 800,
            sourceUrl: "https://private/image.jpg",
            capturedUploadFile: "private-name.jpg",
            bytes: "secret-image",
          })),
        },
      },
      now,
    );
    expect(result.value?.context).toMatchObject({
      phase: "fetch",
      navigatorOnline: true,
      requestBodyImageCount: 4,
    });
    expect(result.value?.context.imageSources).toHaveLength(3);
    expect(result.value?.context.imageSources[0]).toMatchObject({
      sourceKind: "blob_url",
      domNaturalWidth: 800,
      sourceUrl: null,
    });
    expect(JSON.stringify(result.value)).not.toMatch(/private|secret-image/);
  });

  it("redacts credential variants and embedded image URLs", () => {
    const value = redact(
      'access_token=alpha refreshToken=beta sessionId=gamma "authorization":"delta" data:image/png;base64,privateimage blob:https://example.test/private',
    );
    for (const secret of [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "privateimage",
      "example.test",
    ])
      expect(value).not.toContain(secret);
  });

  it("rejects stale, future and malformed event identities explicitly", () => {
    expect(normalizeIncidentEvent({ ...event, id: "bad" }, now).error).toBe(
      "invalid_id",
    );
    expect(
      normalizeIncidentEvent(
        { ...event, occurredAt: "2026-10-01T00:00:00Z" },
        now,
      ).error,
    ).toBe("expired");
    expect(
      normalizeIncidentEvent(
        { ...event, occurredAt: "2026-10-04T00:00:00Z" },
        now,
      ).error,
    ).toBe("invalid_time");
  });

  it("keeps failure evidence within its byte and breadcrumb limits", () => {
    const result = normalizeIncidentEvent(
      {
        ...event,
        context: {
          message: "x".repeat(50000),
          stack: "y".repeat(50000),
          breadcrumbs: Array.from({ length: 100 }, () => ({
            stage: "generation_received",
            message: "z".repeat(2000),
          })),
        },
      },
      now,
    );
    expect(
      Buffer.byteLength(JSON.stringify(result.value?.context)),
    ).toBeLessThanOrEqual(8192);
    expect(result.value?.context.breadcrumbs.length).toBeLessThanOrEqual(30);
  });

  it("does not persist routine breadcrumb streams", () => {
    const result = normalizeIncidentEvent(
      {
        ...event,
        event: "generate_request",
        context: {
          breadcrumbs: [{ stage: "started" }],
          photoCount: 3,
        },
      },
      now,
    );
    expect(result.value?.context.breadcrumbs).toBeUndefined();
    expect(result.value?.context.photoCount).toBe(3);
  });
});
