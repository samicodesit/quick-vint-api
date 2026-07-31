import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();

function runDryRun(args: string[]) {
  const output = execFileSync(
    process.execPath,
    ["scripts/send-support-reply.mjs", ...args, "--dry-run"],
    {
      cwd: backendRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        RESEND_API_KEY: "test-resend-key",
      },
    },
  );

  return JSON.parse(output) as {
    payload: {
      from: string;
      html: string;
      reply_to: string[];
    };
  };
}

describe("send-support-reply script", () => {
  it("uses the original inbound mailbox as reply-to when from is overridden", () => {
    const result = runDryRun([
      "--to",
      "paul@example.com",
      "--subject",
      "Re: presale",
      "--text",
      "Hi Paul",
      "--message-id",
      "<original@example.com>",
      "--from",
      "AutoLister AI <hello@autolister.app>",
    ]);

    expect(result.payload.from).toBe("AutoLister AI <hello@autolister.app>");
    expect(result.payload.reply_to).toEqual(["hello@autolister.app"]);
  });

  it("renders quoted text in a dashed callout", () => {
    const result = runDryRun([
      "--to",
      "glyn@example.com",
      "--subject",
      "Cancellation request",
      "--text",
      "Your report:\n\n> Please cancel my subscription.",
    ]);

    expect(result.payload.html).toContain("border:1px dashed #c9c2dc");
    expect(result.payload.html).toContain("Please cancel my subscription.");
    expect(result.payload.html).not.toContain("<strong>Your report:</strong>");
  });
});
