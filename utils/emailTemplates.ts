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
  from: "Autolister AI <updates@autolister.app>",
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

      <!-- View in browser -->
      <tr>
        <td style="padding: 12px 0; text-align: center;">
          <a href="${BRAND.url}/updates/latest" style="font-size: 12px; color: #999999; text-decoration: underline;">View in browser</a>
        </td>
      </tr>

      <tr>
        <td valign="top" align="center" style="padding-bottom: 40px;">

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
                <p style="margin: 0 0 20px 0; font-size: 16px; color: #333; font-weight: 600;">
                  Happy Selling,
                </p>
                <p style="margin: 0 0 30px 0; font-size: 15px; color: #555;">
                  The ${BRAND.name} Team
                </p>
                <p style="margin: 0; font-size: 12px; color: #999; line-height: 1.6;">
                  To see images in future emails, add <strong style="color: #555;">updates@autolister.app</strong> to your contacts.<br /><br />
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
