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
});
