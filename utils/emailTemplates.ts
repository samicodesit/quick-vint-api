import { LEGACY_TIER_CONFIGS, TIER_CONFIGS } from "./tierConfig";

/**
 * Email layout & templates for campaigns.
 *
 * Layout: XHTML 1.0 Transitional email wrapper — client-safe, responsive.
 * Templates: Reusable content blocks you reference by key from Postman.
 *
 * The layout is extracted from a battle-tested production email and cleaned up
 * to comply with Gmail/Outlook/Apple Mail rendering quirks.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface EmailTemplate {
  /** Email subject line */
  subject: string;
  /** Hidden preheader text (shows in inbox previews) */
  preheader: string;
  /** Rendering style. Direct replies omit campaign footer/unsubscribe chrome. */
  layout?: "campaign" | "direct";
  /** Inner HTML content — inserted inside the layout wrapper */
  body: string;
}

export type PaidWelcomeTier = "starter" | "pro" | "business";

export type PaidWelcomeBilling = {
  amountMinor?: number | null;
  currency?: string | null;
  nextRenewalAt?: string | null;
  statementDescriptor?: string | null;
  sample?: boolean;
  source?: "checkout" | "invoice" | "price";
};

export type PaidWelcomeLimits = {
  daily: number;
  monthly: number;
};

export type PaidWelcomeOptions = {
  billing?: PaidWelcomeBilling;
  isLegacyPlan?: boolean | null;
  limits?: PaidWelcomeLimits | null;
  isCustomPlan?: boolean;
};

// ── Brand constants ──────────────────────────────────────────────────

const BRAND = {
  name: "AutoLister AI",
  color: "#764BA2",
  url: "https://autolister.app",
  from: "AutoLister AI <updates@autolister.app>",
  supportEmail: "support@autolister.app",
  billingPortalUrl:
    process.env.STRIPE_BILLING_PORTAL_URL ||
    "https://billing.stripe.com/p/login/eVqfZj3so5PE3lwcmdenS00",
  statementDescriptor:
    process.env.STRIPE_STATEMENT_DESCRIPTOR || "AUTOLISTER AI",
} as const;

export { BRAND };

// ── Layout wrapper ───────────────────────────────────────────────────

/**
 * Wraps inner HTML content in a full, email-client-safe XHTML document.
 *
 * @param content     - The inner email body HTML
 * @param preheader   - Hidden preview text for inbox clients
 * @param unsubUrl    - Tokenized unsubscribe URL for this recipient
 */
export function wrapEmailLayout(
  content: string,
  preheader: string,
  unsubUrl: string,
): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>${BRAND.name}</title>
  <style type="text/css">
    /* Client resets */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }

    /* iOS blue link fix */
    a[x-apple-data-detectors] {
      color: inherit !important; text-decoration: none !important;
      font-size: inherit !important; font-family: inherit !important;
      font-weight: inherit !important; line-height: inherit !important;
    }

    /* Responsive */
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .fluid-img { width: 100% !important; max-width: 100% !important; height: auto !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .mobile-stack { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Preheader (hidden inbox preview text) -->
  <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; font-family: sans-serif;">
    ${preheader}
  </div>

  <center>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f5f7;">

      <tr>
        <td valign="top" align="center" style="padding: 24px 0 40px 0;">

          <!-- ═══ MAIN CONTAINER ═══ -->
          <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin: 0 auto;">

            <!-- Header bar -->
            <tr>
              <td style="padding: 32px 40px; border-bottom: 1px solid #f0f0f0;" class="mobile-padding">
                <h1 style="margin: 0; font-size: 20px; color: ${BRAND.color}; font-weight: 700; letter-spacing: -0.5px;">${BRAND.name}</h1>
              </td>
            </tr>

            <!-- Body content (injected) -->
            <tr>
              <td style="padding: 40px 40px 30px 40px;" class="mobile-padding">
                ${content}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 30px 40px 40px 40px; text-align: center; border-top: 1px solid #f0f0f0;" class="mobile-padding">
                <p style="margin: 0; font-size: 12px; color: #999; line-height: 1.6;">
                  You're receiving this because you signed up for <strong>${BRAND.name}</strong>.<br />
                  <a href="${unsubUrl}" style="color: #999; text-decoration: underline;">Unsubscribe</a>
                  &nbsp;|&nbsp;
                  <a href="${BRAND.url}" style="color: #999; text-decoration: underline;">Visit Website</a>
                </p>
              </td>
            </tr>

          </table>
          <!-- ═══ END MAIN CONTAINER ═══ -->

        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
}

export function wrapDirectReplyLayout(
  content: string,
  preheader: string,
): string {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="color-scheme" content="light dark" />
  <title>${BRAND.name}</title>
  <style type="text/css">
    @media (prefers-color-scheme: dark) {
      .autolister-direct-email { background-color: #202124 !important; }
      .autolister-direct-shell { background-color: #202124 !important; }
      .autolister-direct-card { background-color: #202124 !important; border-color: #3c4043 !important; }
      .autolister-direct-brand, .autolister-direct-link { color: #c58af9 !important; }
      .autolister-direct-heading, .autolister-direct-strong { color: #f1f3f4 !important; }
      .autolister-direct-muted { color: #bdc1c6 !important; }
      .autolister-direct-billing { background-color: #2b2d31 !important; border-color: #3c4043 !important; }
      .autolister-direct-help { background-color: #202124 !important; border-color: #6f42a1 !important; }
    }
  </style>
</head>
<body class="autolister-direct-email" style="margin: 0; padding: 0; background-color: #f6f7fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
    ${preheader}
  </div>
  <table class="autolister-direct-shell" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f6f7fb;">
    <tr>
      <td align="center" style="padding: 28px 16px;">
        <table class="autolister-direct-card" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border: 1px solid #e9e7f5; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 26px 30px 18px 30px; border-bottom: 1px solid #f0eef9;">
              <p class="autolister-direct-brand" style="margin: 0; font-size: 17px; font-weight: 700; color: ${BRAND.color};">${BRAND.name}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 30px 30px 30px;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function wrapTemplateLayout(
  template: EmailTemplate,
  content: string,
  unsubUrl: string,
): string {
  if (template.layout === "direct") {
    return wrapDirectReplyLayout(content, template.preheader);
  }

  return wrapEmailLayout(content, template.preheader, unsubUrl);
}

// ── Reusable building blocks ─────────────────────────────────────────
// Helpers for common email elements so templates stay readable.

export const el = {
  /** Heading */
  h2: (text: string) =>
    `<h2 style="margin: 0 0 12px 0; font-size: 17px; color: #111; font-weight: 600;">${text}</h2>`,

  /** Body paragraph */
  p: (text: string) =>
    `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.65; color: #444;">${text}</p>`,

  /** Full-width image with optional caption */
  img: (src: string, alt: string, caption?: string) => `
    <div style="margin-bottom: 30px; border: 1px solid #eaeaea; border-radius: 6px; overflow: hidden;">
      <img src="${src}" alt="${alt}" width="520" border="0" style="display: block; width: 100%; max-width: 100%; height: auto; background-color: #f9f9f9;" class="fluid-img">
    </div>
    ${caption ? `<p style="margin: -20px 0 30px 0; font-size: 13px; color: #999; text-align: center;">${caption}</p>` : ""}`,

  /** Centered phone-sized image */
  phone: (src: string, alt: string, caption?: string) => `
    <div style="text-align: center; margin-bottom: 30px; padding: 16px 0;">
      <img src="${src}" alt="${alt}" width="260" border="0" style="display: inline-block; width: 100%; max-width: 260px; height: auto; border: 1px solid #eaeaea; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.06);">
      ${caption ? `<p style="margin: 12px 0 0 0; font-size: 13px; color: #999;">${caption}</p>` : ""}
    </div>`,

  /** Primary CTA button */
  button: (text: string, href: string) => `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${href}" style="background-color: ${BRAND.color}; color: #ffffff; display: inline-block; padding: 14px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">${text}</a>
    </div>`,

  /** Info/callout box */
  callout: (html: string) => `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
      <tr>
        <td style="background-color: #fcfcfc; border: 1px solid #eee; border-radius: 6px; padding: 16px;">
          <p style="margin: 0; font-size: 14px; color: #555; text-align: center; line-height: 1.5;">${html}</p>
        </td>
      </tr>
    </table>`,

  /** "Upcoming" / sneak-peek section with alt background */
  sneakPeek: (title: string, description: string, imageSrc?: string) => `
    </td></tr>
    <tr><td style="padding: 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fafafa; border-top: 1px solid #eee;">
        <tr><td style="padding: 40px;" class="mobile-padding">
          <div style="margin-bottom: 15px; text-align: center;">
            <span style="background-color: #333; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Upcoming</span>
          </div>
          <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #111; font-weight: 600; text-align: center;">${title}</h2>
          <p style="margin: 0 0 25px 0; font-size: 15px; line-height: 1.6; color: #666; text-align: center;">${description}</p>
          ${imageSrc ? `<div style="border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; box-shadow: 0 2px 8px rgba(0,0,0,0.05); background-color: #fff;"><img src="${imageSrc}" alt="Preview" width="520" border="0" style="display: block; width: 100%; height: auto;" class="fluid-img"></div>` : ""}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding: 0 40px;" class="mobile-padding">`,

  /** Horizontal divider */
  divider: () =>
    `<hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />`,
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] || character,
  );
}

function formatLimit(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatBillingAmount(billing?: PaidWelcomeBilling): string | null {
  if (
    !billing ||
    !Number.isInteger(billing.amountMinor) ||
    (billing.amountMinor as number) <= 0 ||
    !billing.currency
  ) {
    return null;
  }

  const currency = billing.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  try {
    const formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    });
    const fractionDigits =
      formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(
      (billing.amountMinor as number) / 10 ** fractionDigits,
    );
  } catch {
    return null;
  }
}

function formatRenewalDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function renderPaidWelcomeBilling(billing?: PaidWelcomeBilling): string {
  if (!billing) return "";

  const amount = formatBillingAmount(billing);
  const renewalDate = formatRenewalDate(billing.nextRenewalAt);
  const descriptor = billing.statementDescriptor || BRAND.statementDescriptor;
  const sampleSuffix = billing.sample ? " (SAMPLE)" : "";
  const lines = [
    amount ? `${amount}/month${sampleSuffix}` : null,
    renewalDate ? `Next renewal: ${renewalDate}${sampleSuffix}` : null,
    descriptor ? `On your card statement: ${escapeHtml(descriptor)}` : null,
  ].filter((line): line is string => Boolean(line));

  if (!lines.length) return "";

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px 0;">
      <tr>
        <td class="autolister-direct-billing" style="background-color: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 18px;">
          <p class="autolister-direct-strong" style="margin: 0 0 7px 0; font-size: 14px; line-height: 1.4; color: #111827; font-weight: 700;">Billing${billing.sample ? " (SAMPLE)" : ""}</p>
          <p class="autolister-direct-muted" style="margin: 0; font-size: 14px; line-height: 1.65; color: #4b5563;">${lines.join("<br />")}</p>
        </td>
      </tr>
    </table>`;
}

function renderPaidWelcomeHelp(tier: PaidWelcomeTier): string {
  const copy =
    tier === "business"
      ? "Want listings to sound like your shop? Email me an example or the details you want included. Need higher limits? Tell me about how many listings you make."
      : tier === "starter"
        ? "Want AutoLister to sound more like your shop? Tell me the tone you use or the details you want it to look for. Need higher limits? Email support and I’ll share the upgrade options."
        : "Want AutoLister to sound more like your shop? Tell me the tone you use or the details you want it to look for. Need more room? Email support and I’ll share the upgrade options.";
  const subject =
    tier === "business"
      ? "AutoLister AI Business help"
      : tier === "pro"
        ? "AutoLister AI Pro style help"
        : "AutoLister AI style help";

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px 0;">
      <tr>
        <td class="autolister-direct-help" style="background-color: #ffffff; border: 1px solid #e9d5ff; border-left: 3px solid ${BRAND.color}; border-radius: 6px; padding: 13px 15px;">
          <p class="autolister-direct-strong" style="margin: 0 0 7px 0; font-size: 15px; line-height: 1.5; color: #111827; font-weight: 700;">I'm here to help.</p>
          <p class="autolister-direct-muted" style="margin: 0 0 11px 0; font-size: 14px; line-height: 1.55; color: #4b5563;">${copy}</p>
          <a class="autolister-direct-link" href="mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(subject)}" style="color: ${BRAND.color}; font-size: 14px; line-height: 1.4; font-weight: 700; text-decoration: underline;">Email support</a>
        </td>
      </tr>
    </table>`;
}

export function getPaidWelcomeTemplate(
  tier: PaidWelcomeTier,
  options: PaidWelcomeOptions = {},
): EmailTemplate {
  const config = (options.isLegacyPlan ? LEGACY_TIER_CONFIGS : TIER_CONFIGS)[
    tier
  ];
  const displayName = config.displayName;
  const limits = options.limits || config.limits;
  const capability =
    tier === "starter"
      ? "AI-generated titles and descriptions."
      : "phone and batch upload.";
  const limitsCopy =
    options.isCustomPlan && !options.limits
      ? "Your custom Business limits are active. Phone and batch upload included."
      : `${formatLimit(limits.daily)} listings per day and ${formatLimit(limits.monthly)} per month. ${capability[0].toUpperCase()}${capability.slice(1, -1)} included.`;

  return {
    subject: `Your AutoLister AI ${displayName} plan is active`,
    preheader: `Your ${displayName} plan is active. Manage your subscription or email support if you need help.`,
    layout: "direct",
    body: [
      `
      <h2 class="autolister-direct-heading" style="margin: 0 0 18px 0; font-size: 24px; line-height: 1.25; color: #111827; font-weight: 700; letter-spacing: -0.2px;">Your ${displayName} plan is active.</h2>`,
      renderPaidWelcomeBilling(options.billing),
      `<p class="autolister-direct-muted" style="margin: 0 0 22px 0; font-size: 15px; line-height: 1.65; color: #374151;">${limitsCopy}</p>`,
      renderPaidWelcomeHelp(tier),
      `<p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5;"><a class="autolister-direct-link" href="${BRAND.billingPortalUrl}" style="color: ${BRAND.color}; text-decoration: underline; font-weight: 600;">Manage your subscription</a></p>`,
      `<p class="autolister-direct-muted" style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.65; color: #444;">Thanks,<br />Sami<br />Founder, AutoLister AI</p>`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ── Templates ────────────────────────────────────────────────────────
// Add new templates here. Reference by key from Postman: { "template_key": "product_update_v1" }

export const TEMPLATES: Record<string, EmailTemplate> = {
  felix_active_user_credits_v1: {
    subject: "5 extra listings for you",
    preheader: "A small thank-you for being an active AutoLister AI user.",
    layout: "direct",
    body: [
      el.p("Hi Felix,"),
      el.p("Thanks for being an active AutoLister AI user."),
      el.callout(
        "🎁 I’ve added <strong>5 extra listing credits</strong> to your account as a small thank-you.",
      ),
      el.p(
        "You can use them whenever you like. They don’t expire and aren’t tied to your daily or monthly limit.",
      ),
      el.p(
        "If you want the AI to write differently, just reply and tell me what you prefer.",
      ),
      el.p(
        "This could be a certain tone, details you always want included, or things you want it to avoid. I’m happy to set that up for you.",
      ),
      el.p(
        "If you ever need more room for listings, you can also view our higher-limit plans.",
      ),
      el.button("View higher-limit plans", "https://autolister.app/pricing"),
      `<p style="margin: 0 0 20px 0; text-align: center; font-size: 13px; line-height: 1.5; color: #777;">Enjoying AutoLister AI? <a href="https://chromewebstore.google.com/detail/autolister-ai-vinted-desc/mommklhpammnlojjobejddmidmdcalcl/reviews" style="color: ${BRAND.color}; text-decoration: underline;">Share an honest review</a></p>`,
      el.p("Best,<br />Sami<br />Founder, AutoLister AI"),
    ].join("\n"),
  },

  custom_limit_reply_marcel_v1: {
    subject: "Re: Request for more Limit a Day",
    preheader:
      "Yes, we can set up a custom plan for around 1,000 listings per month.",
    layout: "direct",
    body: [
      el.p("Hi Marcel,"),
      el.p("Yes, that setup is possible."),
      el.p(
        "For around 100 listings on busy days and around 1,000 per month, I can set up a custom plan:",
      ),
      `<ul style="margin: -6px 0 22px 0; padding-left: 20px; font-size: 15px; color: #444444; line-height: 1.75;">
        <li>up to 1,000 listings per month</li>
        <li>up to 100 listings per day</li>
        <li>all Business features included</li>
        <li>€34.99/month</li>
      </ul>`,
      el.p(
        "So some days can be higher and some lower, as long as the monthly usage stays within the plan.",
      ),
      el.p(
        "What custom request did you have in mind? If it is a small setup or workflow adjustment, I can include it in the price. If it is a bigger feature, I can tell you what is possible beforehand.",
      ),
      el.p(
        "If this works for you, send me the email address of your AutoLister account and I can set it up.",
      ),
      el.p("Best,<br />Sami<br />Founder, AutoLister AI"),
    ].join("\n"),
  },

  product_update_v1: {
    subject: "Product Update: Enhanced formatting & bulk upload teaser",
    preheader:
      "Structured descriptions are now live. Plus: A preview of bulk mobile uploads.",
    body: [
      el.p(
        "We have updated the description engine to prioritize readability and conversion.",
      ),

      el.h2("1. Structured Bullet Points"),
      el.p(
        "To help buyers scan your items faster, the AI now organizes key product details (Size, Brand, Condition) into clean bullet points by default.",
      ),
      el.img(
        "https://autolister.app/update-133.png",
        "New structured description format",
      ),

      el.h2("2. Formatting Preferences"),
      el.p(
        "You retain full control over your listing style. A new <strong>Settings Menu</strong> allows you to toggle between the new list format and the classic paragraph style.",
      ),
      el.phone(
        "https://autolister.app/new-settings.png",
        "New settings menu interface",
        "The new settings interface",
      ),

      el.callout(
        '<span style="display: inline-block; width: 8px; height: 8px; background-color: #2ecc71; border-radius: 50%; margin-right: 6px;"></span><strong>Update Required:</strong> If you don\'t see these changes, please restart your browser to force the extension to update.',
      ),

      el.sneakPeek(
        "Bulk Mobile Uploads",
        "We are finalizing a new workflow that allows you to upload multiple items via mobile and generate all descriptions simultaneously.",
        "https://autolister.app/upcoming.png",
      ),

      el.button("View update details", "https://autolister.app/updates/latest"),
    ].join("\n"),
  },

  welcome: {
    subject: "Welcome to AutoLister! 🎉",
    preheader:
      "You're all set to start creating amazing Vinted listings with AI.",
    body: [
      el.h2("Welcome aboard!"),
      el.p(
        "Thanks for joining AutoLister. You're ready to start creating professional Vinted listings in seconds.",
      ),
      el.p("Here's what you can do:"),
      `<ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 15px; color: #444; line-height: 2;">
        <li>Install the Chrome extension</li>
        <li>Upload your first item photo</li>
        <li>Let AI generate your listing</li>
      </ul>`,
      el.button("Get Started", "https://autolister.app"),
    ].join("\n"),
  },

  starter_welcome_v1: getPaidWelcomeTemplate("starter"),

  pro_welcome_v1: getPaidWelcomeTemplate("pro"),

  business_welcome_v1: getPaidWelcomeTemplate("business"),

  honest_review_request_v1: {
    subject: "Did AutoLister help with your Vinted listings?",
    preheader:
      "If it saved you time, a quick review helps other sellers find it too.",
    body: [
      el.p("Hi there,"),
      el.p(
        "I hope AutoLister AI has made your Vinted listing a little easier.",
      ),
      el.callout(
        "If it has saved you some time, <strong>a quick honest review</strong> helps other sellers decide if AutoLister is worth trying.",
      ),
      el.button(
        "Leave an honest review",
        "https://chromewebstore.google.com/detail/autolister-ai-vinted-desc/mommklhpammnlojjobejddmidmdcalcl/reviews",
      ),
      el.p(
        "Want the AI to write listings in your style? <strong>Just reply with what you prefer, and I’ll tailor it for you at no extra cost.</strong>",
      ),
      el.p("This is a one-time request, so I will not keep asking."),
      el.p("Thanks, and happy selling,<br />Sami<br />Founder, AutoLister AI"),
    ].join("\n"),
  },

  limit_hit_followup_v1: {
    subject: "Keep listing faster on Vinted",
    preheader:
      "You used your free AutoLister listings. Here is 20% off the first month if you want to continue.",
    body: [
      el.p("Hi,"),
      el.p(
        "You used your free AutoLister AI listings. If it helped, you can keep creating Vinted listings with a paid plan.",
      ),
      el.callout(
        '<strong style="font-size: 16px; color: #111827;">LISTFASTER20</strong><br />20% off your first month.',
      ),
      el.p(
        "<strong>Starter</strong> is enough if you only list sometimes. <strong>Pro</strong> is better if you list often and want tone controls and emoji support.",
      ),
      el.p(
        "AutoLister does not need to connect your Vinted account. You stay in control and review every listing before publishing.",
      ),
      el.button("View plans", "{{LIMIT_FOLLOWUP_PRICING_URL}}"),
      el.p(
        "Want AutoLister to work better for the way you sell? Just reply with one thing you’d change. I’ll add <strong>🎁 10 free extra listings</strong> to your account.",
      ),
      el.p("I will not keep sending you follow-ups about this."),
      el.p("Thanks,<br />Sami<br />Founder, AutoLister AI"),
    ].join("\n"),
  },

  charlotte_payment_fix_pro_offer_v1: {
    subject: "A quick AutoLister AI update",
    preheader:
      "Starter is active. There is also a Pro code inside if you want it.",
    body: [
      (() => {
        const pricingUrl = "{{PRICING_OFFER_URL}}";
        return [
          `<p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.65; color: #444;"><strong>Scroll down for French text.</strong></p>`,
          el.p("Hi Charlotte,"),
          el.p(
            "Quick note: we fixed an issue that could stop the pricing page from opening payment.",
          ),
          el.p(
            `Your Starter plan is active. If you want to upgrade to <strong style="color: ${BRAND.color};">Pro</strong>, use this code before Sunday:`,
          ),
          el.callout(
            '<strong style="font-size: 16px; color: #111827;">L1ST3R50</strong><br />Valid until Sunday, July 5 at 11:59 PM CEST.',
          ),
          el.p(
            "With the code, Stripe currently shows €1.00 today for the rest of this month. After that, Pro renews at €9.99/month unless you cancel or change plan.",
          ),
          el.button("Open pricing page", pricingUrl),
          el.p("Thanks,<br />Sami<br />Founder, AutoLister AI"),
          el.divider(),
          el.p("Bonjour Charlotte,"),
          el.p(
            "Petit message pour vous prévenir que nous avons corrigé un problème qui pouvait empêcher la page de tarifs d’ouvrir le paiement.",
          ),
          el.p(
            `Votre abonnement Starter est bien actif. Si vous souhaitez passer à <strong style="color: ${BRAND.color};">Pro</strong>, vous pouvez utiliser ce code avant dimanche :`,
          ),
          el.callout(
            '<strong style="font-size: 16px; color: #111827;">L1ST3R50</strong><br />Valable jusqu’au dimanche 5 juillet à 23h59 CEST.',
          ),
          el.p(
            "Avec ce code, Stripe affiche actuellement €1.00 à payer aujourd’hui pour le reste du mois. Ensuite, Pro se renouvelle à €9.99/mois, sauf si vous annulez ou changez de formule.",
          ),
          el.button("Ouvrir la page de tarifs", pricingUrl),
          el.p("Merci,<br />Sami<br />Founder, AutoLister AI"),
        ].join("\n");
      })(),
    ].join("\n"),
  },

  generic_announcement: {
    subject: "News from AutoLister",
    preheader: "We have something to share with you.",
    body: [
      el.p("{{CONTENT}}"),
      el.button("Learn More", "https://autolister.app/updates/latest"),
    ].join("\n"),
  },
};

/**
 * Returns all template keys + subjects for listing/preview purposes
 */
export function getTemplateIndex(): Array<{
  key: string;
  subject: string;
  preheader: string;
}> {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    key,
    subject: t.subject,
    preheader: t.preheader,
  }));
}
