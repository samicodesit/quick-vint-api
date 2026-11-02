# Model-photo discovery and gradual positioning expansion

Prepared November 2, 2026. Local preparation only. Campaign publication is held until the extension update is publicly available and the owner approves release. No spending, deployment, outreach or new assistant-account access is authorized by this document.

## Decision

Start with **AI model photos for second-hand clothing sellers**. Keep AutoLister's Vinted acquisition pages and homepage experiment intact. Test a broader use case through one feature page before changing the brand's main positioning.

The general workflow is the web app: upload item photos, create or reuse a saved model, review generated photos, save JPEGs and upload them manually where needed. The extension is specifically for Vinted. Do not describe other marketplaces as integrations. The draft photo workspace has a Save photo (JPEG) action; this source audit is not a fresh end-to-end generation/download test.

## Findings and prior evidence

- Live homepage, photo guide, robots.txt and sitemap index returned HTTP 200. Robots currently allows all crawlers. Examined pages had self-referencing canonicals and no noindex directive. No robots change is needed.
- Publicly readable homepage content did not yet explain model photos. The local homepage promotion and campaign pack are held, not live.
- Existing site schemas distinguish the extension and web app but still describe text generation. Update accurate visible product facts and their schema together when releasing model content.
- The October 28 discovery pilot already recorded 12 answers from ChatGPT, Claude and Perplexity, with AutoLister mentioned in 7. Those were primarily listing-text queries, not a model-photo baseline. Gemini and Grok remained unmeasured because of errors or access gates. Reuse the evidence in `reports/ai-visibility-2026-10-28/baseline.json` in the parent workspace, not a claimed zero baseline.
- That pilot surfaced a concrete misunderstanding: some answers described AutoLister as desktop-only. Audit the current owned pages that were cited before releasing new content; show the web app's phone workflow clearly. Source corrections take priority over more articles.
- This audit did not verify crawler-origin access through the CDN, Search Console index coverage, or a new paid activation journey.

## Provider preparation

| Service                     | Documented discovery mechanism                                                                                                                                                        | Our action                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT                     | OAI-SearchBot serves search discovery. ChatGPT-User handles user-initiated retrieval. GPTBot training controls are separate.                                                          | Keep public content accessible. Verify genuine search-bot access if infrastructure evidence shows challenges. Do not change training policy just to seek recommendations.                                       |
| Gemini and Google AI search | Google Search uses normal indexing foundations. Google-Extended separately controls future Gemini training and grounding in Gemini Apps; it does not control Google Search inclusion. | Preserve current access. Keep Gemini and Google Search measurement separate. Improve factual, indexable pages and existing schema.                                                                              |
| Claude                      | Claude-SearchBot supports search; Claude-User fetches for users; ClaudeBot is for training.                                                                                           | Preserve discovery access. Do not invent an IP allowlist: Anthropic does not currently publish fixed crawler ranges.                                                                                            |
| Perplexity                  | PerplexityBot supports search indexing; Perplexity-User retrieves for user requests. Published IP lists are available.                                                                | Keep public pages reachable. If necessary, diagnose verified requests using official IP data, not user-agent names alone.                                                                                       |
| Grok                        | Official API documentation describes web search and X search tools.                                                                                                                   | Publish useful crawlable pages and later distribute genuine product demonstrations. No verified publisher ranking recipe was found. API capabilities do not establish every consumer mode's retrieval pipeline. |

Sources checked November 2, 2026: [OpenAI bots](https://developers.openai.com/api/docs/bots), [ChatGPT search](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt), [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), [Google optimization guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [Google-Extended](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended), [Claude crawlers](https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers), [Grok web search](https://docs.x.ai/developers/tools/web-search), [Grok X search](https://docs.x.ai/developers/tools/x-search).

No special AI schema is required for Google Search. Google explicitly says it does not use llms.txt for this purpose. Other providers' benefit is not established by the reviewed guidance, so it is not a launch priority. Access makes discovery possible; it does not guarantee recommendations.

## First content release

### One commercial feature page

Proposed route: `/ai-model-photos`, with the existing English, Dutch, French and German locale conventions.

Draft title: **AI model photos for clothing sellers | AutoLister**

Draft heading: **Show your clothes on a model.**

Draft introduction: **Turn your item photos into two AI model photos. Create your model once and reuse it for your next listings.**

Page sequence:

1. One strong approved comparison, readable on a phone. Use the owner's exact selected images and supplied counts, without reconstructed new proof or claims about sales causation.
2. Three actions: upload item photos, choose your model, review and save the photos. Use a checked screenshot of the actual product.
3. Explain the reusable model and front/back pair through the example, with brief factual answers about supported items, saving photos and retaining originals. Generated photos do not establish actual fit or unseen details.
4. Web-app CTA for the broader audience, with a separate clearly named Vinted-extension link. Existing Vinted campaign/device-specific CTA behavior stays intact. No claim of direct publishing to other marketplaces.

Keep prices and allowances tied to the current product, not a new free/unlimited promise. Reuse typography, image optimization, locale routing and analytics. Use descriptive alt text, accessible text for important results, canonical URLs, hreflang and sitemap entries. Keep private model assets private. Link the page from the existing relevant photo guide and model promotion without removing existing SEO content.

Update existing application schema descriptions to match visible capabilities, retaining entity IDs. If a case study names a person as author, use Person rather than the current layout's unconditional Organization author. Do not add invented ratings or generic FAQ schema for rankings.

### Supporting content, in order

1. Release the already prepared localized Vinted setup guide and four-listing story when the extension is public. Each serves a separate intent. Both link the web app and extension with existing tracking.
2. Add one broader practical guide: **How to photograph clothes for resale without modelling them**. Cover source photo selection, flat lays, garment details and the actual model-photo workflow. Do not create another page merely for each synonym.
3. Consider a marketplace-specific guide only after validating its manual export workflow and seeing relevant queries or activated users. No automatic set of Depop, eBay, Poshmark or Shopify landing pages.

Keyword hypotheses are in `model-photo-keyword-map.csv`. Search volumes and difficulty have not been measured. Initial research found current first-party use of flat-lay-to-model language, including [getimg.ai's guide](https://getimg.ai/blog/turn-clothing-photos-into-ai-fashion-model-photos); this validates terminology, not demand or conversion.

Localize meaning and seller vocabulary, not keyword strings mechanically. Keep the exact comparison art unchanged while translating surrounding copy, accessible descriptions and CTAs. No fake product screenshots.

## Measurement and release gates

Local code now recognizes identifiable ChatGPT, Gemini, Claude, Perplexity and Grok referrers and canonical-domain UTM sources in existing first-touch attribution. Explicit campaign medium is preserved; internal navigation does not overwrite first touch. Referrer paths are discarded. No database migration or historical backfill is needed.

This measures provider referrals, not proof of recommendations. Claude marketing-domain referrals also do not prove an assistant citation. Native apps can strip referrers; unidentifiable traffic stays unidentifiable. X/t.co is not guessed to be Grok. Google referrers cannot distinguish AI Overviews from ordinary search.

Report visits and CTA clicks separately from signup, model creation, first successful photo pair, repeat usage and payment. Retain existing campaign identity and locale/destination context. Verify downstream event joins before claiming a complete conversion funnel.

Run a small fixed discovery panel across all five assistants when access is available, without paid API testing or new account permissions. Use fresh contexts and record date, language, model/mode, web-search availability, exact prompt, cited URLs and factual errors. Suggested model-photo prompts:

- Which tools can turn photos of clothes I'm selling into model photos?
- How can I show second-hand clothing on a model without photographing myself?
- Can I use the same AI model for several clothing listings?
- What can turn a flat-lay dress photo into an on-model photo?

Keep branded accuracy checks separate from unbranded discovery. Failed or inaccessible runs are unknown, not negative mentions. Review at a four-week checkpoint after release, allowing for indexing and sample size. This is a review cadence, not a ranking deadline. Expand only when queries and useful activation support it.

Before release: confirm extension public, owner approval, final localized desktop/mobile renders, actual product screenshots, schema/canonical/hreflang/sitemap checks, exact CTA journey, current allowance copy, downstream tracking and required production gate. No publication, spend or deployment happened in this preparation.

Verification: six targeted attribution, analytics, API-claim and report suites passed, 80 tests total. Formatting and git diff checks passed. Full production gate and live referral verification remain release checks.
