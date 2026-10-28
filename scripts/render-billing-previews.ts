import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getPaidWelcomeTemplate,
  wrapDirectReplyLayout,
} from "../utils/emailTemplates";
import { cancellationNotice } from "../utils/billingNotices";
import { withdrawalReceipt } from "../utils/withdrawalReceipt";

// Offline fixture renderer only. No database writes, provider sends or production identities.
const out = process.argv[2];
if (!out) throw new Error("Supply a private preview output directory");
mkdirSync(out, { recursive: true, mode: 0o700 });
const files: Record<string, string> = {};
for (const tier of ["starter", "pro", "business"] as const) {
  const amount = { starter: 399, pro: 999, business: 1999 }[tier];
  const template = getPaidWelcomeTemplate(tier, {
    billing: {
      policyVersion: "2026-10-28",
      initialCharge: { amountMinor: amount, currency: "eur" },
      recurringBase: { amountMinor: amount, currency: "eur" },
      nextRenewalAt: "2026-11-28T12:00:00Z",
      discountDescription: "No introductory discount.",
      sample: true,
    },
  });
  files[`welcome-${tier}`] = wrapDirectReplyLayout(
    template.body,
    template.preheader,
  );
  for (const attachment of template.attachments || [])
    writeFileSync(
      resolve(out, attachment.filename),
      Buffer.from(attachment.content, "base64"),
      { mode: 0o600 },
    );
}
const discount = getPaidWelcomeTemplate("pro", {
  billing: {
    policyVersion: "2026-10-28",
    initialCharge: { amountMinor: 704, currency: "gbp" },
    recurringBase: { amountMinor: 999, currency: "eur" },
    discountDescription: "20% off the first invoice.",
    nextRenewalAt: "2026-11-28T12:00:00Z",
    sample: true,
  },
});
files["welcome-discount"] = wrapDirectReplyLayout(
  discount.body,
  discount.preheader,
);
const stopped = getPaidWelcomeTemplate("pro", {
  billing: {
    policyVersion: "2026-10-28",
    initialCharge: { amountMinor: 999, currency: "eur" },
    recurringBase: { amountMinor: 999, currency: "eur" },
    discountDescription: "No introductory discount.",
    renewalStopped: true,
    accessEndsAt: "2026-11-28T12:00:00Z",
    sample: true,
  },
});
files["welcome-renewal-stopped"] = wrapDirectReplyLayout(
  stopped.body,
  stopped.preheader,
);
files["cancellation"] = cancellationNotice(
  {
    id: "evt_preview",
    type: "customer.subscription.updated",
    data: {
      previous_attributes: { cancel_at_period_end: false },
      object: {
        id: "sub_preview",
        cancel_at_period_end: true,
        canceled_at: 1793192400,
        cancel_at: 1795867200,
      },
    },
  } as any,
  "preview@example.com",
)!.payload.html;
const receipt = withdrawalReceipt({
  name: "Preview Customer",
  email: "preview@example.com",
  contract: "AutoLister Pro subscription, purchased 28 October 2026",
  requestId: "11111111-1111-4111-8111-111111111111",
  receivedAt: "2026-10-28T12:00:00Z",
});
files["withdrawal-receipt"] = receipt.payload.html;
files["withdrawal-staff"] = receipt.staffPayload.html;
for (const [name, html] of Object.entries(files))
  writeFileSync(resolve(out, `${name}.html`), html, { mode: 0o600 });
writeFileSync(
  resolve(out, "index.html"),
  `<!doctype html><html><body><h1>AutoLister billing email previews</h1><p>Offline sample data. No messages sent.</p><ul>${Object.keys(
    files,
  )
    .map((name) => `<li><a href="${name}.html">${name}</a></li>`)
    .join("")}</ul></body></html>`,
  { mode: 0o600 },
);
console.log(`Rendered ${Object.keys(files).length} exact-template previews.`);
