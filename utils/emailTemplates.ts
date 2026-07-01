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
  /** Inner HTML content — inserted inside the layout wrapper */
  body: string;
}

// ── Brand constants ──────────────────────────────────────────────────

const BRAND = {
  name: "AutoLister AI",
  color: "#764BA2",
  url: "https://autolister.app",
  from: "AutoLister AI <updates@autolister.app>",
  supportEmail: "support@autolister.app",
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

// ── Templates ────────────────────────────────────────────────────────
// Add new templates here. Reference by key from Postman: { "template_key": "product_update_v1" }

export const TEMPLATES: Record<string, EmailTemplate> = {
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

  business_welcome_v1: {
    subject: "Welcome to AutoLister AI Business",
    preheader:
      "Thanks for choosing Business. Reply anytime with feedback, requests, or workflow ideas.",
    body: [
      el.p("Hi,"),
      el.p(
        "I saw you upgraded to Business. Thank you — I really appreciate it.",
      ),
      el.p(
        "Business is meant for sellers who list often enough that the small things start to matter: fewer limits, faster drafts, and less time rewriting the same Vinted details over and over.",
      ),
      `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 2px 0 22px 0;">
        <tr>
          <td style="background-color: #fbfaff; border: 1px solid #eee8ff; border-radius: 8px; padding: 16px 18px;">
            <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #333333;"><strong>Your Business plan is active.</strong><br />You now have AutoLister AI's highest limits and Business-level support.</p>
          </td>
        </tr>
      </table>
      `,
      el.p(
        "If something feels slow, unclear, or missing, just reply to this email. No form, no ticket system. I read the replies myself.",
      ),
      el.p("The most useful feedback is usually simple:"),
      `
      <ul style="margin: -8px 0 22px 0; padding-left: 20px; font-size: 15px; color: #444444; line-height: 1.75;">
        <li>what still takes too long</li>
        <li>what AutoLister misses on your items</li>
        <li>what would make bulk listing easier</li>
      </ul>
      `,
      el.p(
        "Feature requests are welcome too, even if they are rough ideas. If it would save you time as a serious seller, I want to hear it.",
      ),
      el.p("Thanks again,<br />Sami"),
    ].join("\n"),
  },

  honest_review_request_v1: {
    subject: "Did AutoLister help with your Vinted listings?",
    preheader:
      "If it saved you time, a quick review helps other sellers find it too.",
    body: [
      el.p("Hey,"),
      el.p(
        "Hope AutoLister AI has been useful for your Vinted listings.",
      ),
      el.p(
        "If it saved you time, could you leave a quick honest review on the Chrome Web Store? It helps other sellers find the extension and decide if it is worth trying.",
      ),
      el.button(
        "Leave an honest review",
        "https://chromewebstore.google.com/detail/autolister-ai-vinted-desc/mommklhpammnlojjobejddmidmdcalcl/reviews",
      ),
      el.p(
        "If something felt off or missing, you can just reply here. I read those replies myself.",
      ),
      el.p("This is a one-time request, so I will not keep asking."),
      el.p("Thanks,<br />Sami"),
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
