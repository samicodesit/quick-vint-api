import { expect, it } from "vitest";
import { sanitizeSentryEvent } from "../../../utils/incidents/sentryPolicy";

it("scrubs automatic SDK events without replacing their exception identity", () => {
  const event: any = sanitizeSentryEvent({
    exception: {
      values: [
        {
          type: "TypeError",
          value: "failed https://app.test/?token=secret",
          stacktrace: {
            frames: [
              {
                filename: "https://app.test/file.js?token=secret",
                function: "applyFields",
                vars: { token: "secret" },
                pre_context: ["private"],
              },
            ],
          },
        },
      ],
    },
    request: {
      url: "https://app.test/api/phone-upload?sessionId=private",
      headers: { Authorization: "secret" },
      data: "private",
      query_string: "private",
    },
    user: { id: "verified-id", email: "seller@example.com" },
    extra: { description: "private" },
    contexts: { arbitrary: { token: "secret" } },
    breadcrumbs: [{ message: "Bearer secret", data: { token: "secret" } }],
  });
  expect(event.exception.values[0].type).toBe("TypeError");
  expect(event.exception.values[0].stacktrace.frames[0].function).toBe(
    "applyFields",
  );
  for (const value of ["secret", "private", "seller@example.com"])
    expect(JSON.stringify(event)).not.toContain(value);
});
