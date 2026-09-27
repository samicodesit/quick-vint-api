import { describe, expect, it } from "vitest";
import {
  invitationEmail,
  sendInvitationEmail,
} from "../../../utils/ops/admin/invite-mail";
describe("invitation email", () => {
  it("renders a branded, escaped, expiring invitation", () => {
    const mail = invitationEmail(
      "Studio <One>",
      "https://autolister.app/app/invite?token=abc&x=1",
    );
    expect(mail.html).toContain("AutoLister");
    expect(mail.html).toContain("Studio &lt;One&gt;");
    expect(mail.html).toContain("token=abc&amp;x=1");
    expect(mail.html).toContain("48 hours");
  });
  it("keeps sending disabled without explicit configuration", async () => {
    const before = process.env.OPS_INVITE_MAIL_ENABLED;
    delete process.env.OPS_INVITE_MAIL_ENABLED;
    await expect(
      sendInvitationEmail(
        "test@example.test",
        "Studio",
        "https://example.test",
      ),
    ).rejects.toThrow("disabled");
    if (before !== undefined) process.env.OPS_INVITE_MAIL_ENABLED = before;
  });
});
