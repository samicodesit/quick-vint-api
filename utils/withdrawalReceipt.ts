import { BRAND, wrapDirectReplyLayout } from "./emailTemplates";
import { escapeBillingHtml as esc } from "./subscriptionPolicyHtml";

export const WITHDRAWAL_STATEMENT =
  "I hereby give notice that I withdraw from the AutoLister contract identified above.";
export function withdrawalReceipt(input: {
  name: string;
  email: string;
  contract: string;
  requestId: string;
  receivedAt: string;
}) {
  const { name, email, contract, requestId, receivedAt } = input;
  const details = `<p>Name: ${esc(name)}<br />Email: ${esc(email)}<br />Contract: ${esc(contract)}</p><p>${WITHDRAWAL_STATEMENT}</p><p>Received: ${esc(receivedAt)}<br />Reference: ${esc(requestId)}</p>`;
  const payload = (to: string, subject: string, html: string) => ({
    from: BRAND.from,
    to: [to],
    reply_to: BRAND.supportEmail,
    subject,
    html: wrapDirectReplyLayout(html, subject),
  });
  return {
    payload: payload(
      email,
      "Your AutoLister withdrawal statement was received",
      `<h2>Withdrawal statement received</h2>${details}<p>This acknowledgment records your statement and its receipt time. It does not mean a refund has already been issued. We will confirm the outcome separately. Your statutory rights remain unaffected.</p><p><a href="mailto:support@autolister.app">Contact support</a></p>`,
    ),
    staffPayload: payload(
      "support@autolister.app",
      "Action needed: AutoLister withdrawal statement",
      `<h2>Review this withdrawal promptly</h2>${details}<p>Verify the contract and identity before changing an account. Preserve the original receipt time. Do not require a second withdrawal statement. Record the cancellation and any refund decision in the billing withdrawal ledger.</p>`,
    ),
  };
}
