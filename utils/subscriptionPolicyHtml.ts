import policy from "../src/data/subscription-policy-2026-10-28.json";

export function escapeBillingHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function renderSubscriptionPolicyHtml() {
  const p = (text: string) =>
    `<p class="autolister-direct-muted" style="font-size:13px;line-height:1.6;margin:8px 0 16px;color:#374151;">${escapeBillingHtml(text)}</p>`;
  return `<section aria-label="Subscription terms" style="border-top:1px solid #e5e7eb;padding-top:16px;">
    <h3 class="autolister-direct-strong" style="font-size:16px;margin:0 0 12px;">Your subscription terms (${policy.version})</h3>
    ${p(`${policy.seller}. ${policy.address}. Telephone: ${policy.phone}.`)}
    ${policy.sections.map((section) => `<h4 class="autolister-direct-strong" style="font-size:14px;margin:16px 0 4px;">${escapeBillingHtml(section.title)}</h4>${p(section.text)}`).join("")}
    <p style="font-size:13px;line-height:1.6;"><a href="https://autolister.app/withdraw">Withdraw from your contract</a> · <a href="mailto:support@autolister.app">Contact support</a></p>
  </section>`;
}
