# Mobile Web Acquisition SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight distinct, crawlable Vinted listing-generator landing pages that introduce the authenticated `/app` flow while preserving current extension, guide, pricing, description-generator, and Orion intent.

**Architecture:** A typed eight-locale copy model drives static Astro routes and initial HTML. A route-aware CTA policy supplies one filled primary per route and breakpoint, while `SiteLayout` can opt the new family out of the global Chrome-extension schema. A reviewed static sample reuses the app client's read-only components and never calls generation for visitors. A normalized sitemap filter and built-output checks enforce the public/private boundary.

**Tech Stack:** Astro 5 static routes, TypeScript 5.8, existing `SiteLayout.astro`, `localizedPath`, `SUPPORTED_SITE_LOCALES`, `@astrojs/sitemap`, existing CSS and brand tokens, JSON-LD, Vitest 4, `pnpm` build and preview scripts, and the existing `CHROME_WEB_STORE_URL` constant from `src/utils/blog.ts`.

**Spec:** `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`

## Global Constraints

- The landing family is exactly `/vinted-listing-generator`, `/fr/vinted-listing-generator`, `/de/vinted-listing-generator`, `/nl/vinted-listing-generator`, `/pl/vinted-listing-generator`, `/es/vinted-listing-generator`, `/it/vinted-listing-generator`, and `/pt/vinted-listing-generator`; English is x-default.
- These are separate commercial pages, not `LISTING_GUIDE_SLUGS` and not replacements for existing extension, description, template, checklist, photo-to-desktop, ChatGPT, or Orion pages.
- Every route has unique human-quality localized title, H1, description, examples, visible FAQ, signup truth, and CTA copy. Initial HTML contains the product explanation and sample disclosure. Mobile content has parity with desktop content. Canonicals are absolute self URLs with no trailing slash, and every page has reciprocal alternates for the eight locales plus x-default.
- A public sample uses the app client's real read-only components and a disclosed item, photo, title, and description produced by the actual AutoLister backend and approved through a manual release record. No API approval-identifier contract is invented.
- Public pages never accept visitor photos, call generation anonymously, create guest quota, show fake success state, or imply seller-note, history, batch, offline, share-target, or native Vinted support.
- The new landing family uses `/app` as the single filled primary CTA on mobile and desktop. Existing homepage, guides, blog, and pricing surfaces use `/app` as filled primary on mobile while preserving the current extension primary and demo on desktop. Orion remains extension-primary on every viewport and may offer only a subtle web link after instructions.
- CTA policy is route context plus CSS breakpoint, never user-agent sniffing, extension detection, or Orion runtime detection. No viewport shows two filled primaries. The shared abstraction preserves locale and sanitized attribution.
- New landing pages use page-scoped `WebPage`, `BreadcrumbList`, `SoftwareApplication` with `applicationCategory: "BrowserApplication"`, and `FAQPage` only for visible FAQ entries. They must not inherit or misrepresent the global Chrome-extension schema, Chrome Web Store URL, `aggregateRating`, or `applicationCategory: "BrowserExtension"`.
- `/app`, `/app/auth/callback`, `/auth/callback`, and `/customer-usage` remain noindex and excluded from the sitemap. Existing private exclusions remain. `robots.txt` stays crawlable so crawlers can observe noindex.
- The 18 output languages remain authenticated product controls, not public SEO route variants. Blog CTA paths are limited to the four blog locales currently implemented: en, fr, de, and nl.
- Matching-locale internal links preserve approved `ref`, UTM, first-touch, source route, locale, CTA placement, and `web_app_click` context. The existing attribution code does not currently decorate `/app`; the plan adds a new sanitized app-link helper.
- Public pages must meet lab mobile budgets of LCP at or below 2.5 seconds, CLS at or below 0.1, and initial JavaScript transfer at or below 150 KB compressed before launch. These are preview lab proxies, not field p75 claims. Real field p75 is monitored after launch.
- Do not claim rankings, traffic, conversion, or native app opening. Crawlable distinct pages support discoverability, but outcomes are measured after release.
- Do not publish a route, sample, or filled CTA before the app-client plan's iPhone Safari and Android Chrome gates pass. No implementation task deploys production or submits a Search Console change.
- Use `pnpm` commands from `/home/mests/projects/quick-vint-api`; preserve unrelated dirty files and stage only files owned by this task.

## Review Focus

1. Every public route must have reciprocal hreflang and x-default without entering the existing guide slug map. Pin this to `landing_routes_have_reciprocal_hreflang_and_are_not_guides` in Task 2.
2. The new page must emit web-scoped schema only, and FAQ JSON-LD must describe visible FAQ content. Pin this to `landing_schema_is_web_scoped_and_faq_is_visible` in Task 1.
3. CTA policy must yield exactly one filled primary at each route and breakpoint while Orion remains extension-first. Pin this to `cta_policy_has_one_primary_and_preserves_orion` in Task 4.
4. The sample must be static, disclosed, and tied to manual backend approval evidence without inventing an API approval field. Pin this to `sample_requires_manual_backend_evidence` in Task 3.
5. Sitemap and noindex boundaries must survive trailing-slash normalization and include all eight public routes. Pin this to `sitemap_includes_landings_and_excludes_private_routes` in Task 5.

---

## File structure map

| File                                                                                                                                                                        | Responsibility                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/routeContext.ts`                                                                                                                                                 | Pure route and breakpoint CTA policy for generator landing, existing marketing, and Orion contexts.                                    |
| `src/components/RouteAwareCta.astro`                                                                                                                                        | Shared CTA markup, filled/quiet classes, locale links, and sanitized attribution data attributes.                                      |
| `src/utils/publicSchema.ts`                                                                                                                                                 | Typed `JsonLd` plus page-scoped WebPage, BreadcrumbList, browser SoftwareApplication, and visible FAQ builders.                        |
| `src/layouts/SiteLayout.astro`                                                                                                                                              | Existing layout integration, optional global extension-schema suppression, and route-aware nav props while retaining current defaults. |
| `src/i18n/mobileListingGenerator.ts`                                                                                                                                        | Typed eight-locale landing copy, paths, alternates, localized CTA labels, examples, and FAQ.                                           |
| `src/components/MobileListingGeneratorLanding.astro`                                                                                                                        | Initial HTML landing layout, metadata, schema, signup truth, sample disclosure, internal links, and route-aware CTA.                   |
| `src/components/MobileListingGeneratorSample.astro`                                                                                                                         | Disclosed static sample rendered through app-client shared read-only components.                                                       |
| `src/data/mobileListingGeneratorSample.ts`                                                                                                                                  | Sample manifest and manual evidence reference, without an API approval contract.                                                       |
| `public/landing-samples/vinted-listing-generator/approved-item.jpg`                                                                                                         | Reviewed sample image from the real backend workflow.                                                                                  |
| `src/pages/vinted-listing-generator.astro`                                                                                                                                  | English x-default route.                                                                                                               |
| `src/pages/[lang]/vinted-listing-generator.astro`                                                                                                                           | Seven localized static routes limited to the approved eight-locale family.                                                             |
| `src/components/__tests__/RouteAwareCta.test.ts`                                                                                                                            | Pure route policy, schema type, and schema isolation tests.                                                                            |
| `src/pages/__tests__/mobileListingGenerator.test.ts`                                                                                                                        | Locale model, static route, output copy, sample, and initial HTML tests.                                                               |
| `src/pages/__tests__/acquisitionLinks.test.ts`                                                                                                                              | Internal links, app-link attribution, route contexts, and Orion preservation.                                                          |
| `src/pages/__tests__/acquisitionSeo.test.ts`                                                                                                                                | Built-output canonical, hreflang, schema, sitemap, noindex, trailing-slash, and performance-contract tests.                            |
| `astro.config.mjs`                                                                                                                                                          | Normalized sitemap filter for known private routes and existing exclusions.                                                            |
| `src/utils/appLink.ts`                                                                                                                                                      | New sanitized `/app` and landing href builder plus bounded `web_app_click` context.                                                    |
| `src/pages/index.astro`, `src/pages/[lang]/index.astro`                                                                                                                     | Matching-locale app and landing links while retaining existing home intent.                                                            |
| `src/pages/pricing.astro`, `src/pages/[lang]/pricing.astro`                                                                                                                 | Root and localized pricing route props and matching landing links.                                                                     |
| `src/components/PricingPage.astro`                                                                                                                                          | Pricing CTA placement and locale-aware landing link.                                                                                   |
| `src/pages/vinted-description-generator.astro`                                                                                                                              | Related landing link while preserving extension-first page intent.                                                                     |
| `src/components/ListingGuide.astro`                                                                                                                                         | Matching-locale related landing link and responsive CTA.                                                                               |
| `src/components/blog/InlineCTA.astro`, `src/components/blog/EndOfPostCTA.astro`, `src/components/blog/PhotoToListingCTA.astro`, `src/components/blog/WritingStyleCTA.astro` | Blog links for en, fr, de, and nl only.                                                                                                |
| `src/pages/vinted-extension-iphone-orion.astro`                                                                                                                             | Extension-first Orion CTA with optional post-instruction web alternative.                                                              |
| `src/pages/customer-usage.astro`                                                                                                                                            | Noindex metadata for the known private usage route.                                                                                    |

## Dependencies and execution order

The app-client plan must complete and pass preview plus iPhone Safari and Android Chrome gates before this plan publishes a filled `/app` CTA or approved sample. Task 1 defines pure CTA and schema contracts. Task 2 consumes those contracts and defines the eight routes. Task 3 consumes the app client's shared read-only components and requires manual backend evidence. Task 4 integrates existing surfaces and owns `SiteLayout`, `HomeLanding`, pricing routes, and the new app-link helper. Task 5 consumes all prior tasks and validates built output, sitemap, noindex, and release checks. Public pages never call backend generation.

### Task 1: Route-aware policy and page-scoped schema foundation

**Files:**

- Create: `src/utils/routeContext.ts`
- Create: `src/components/RouteAwareCta.astro`
- Create: `src/utils/publicSchema.ts`
- Create: `src/components/__tests__/RouteAwareCta.test.ts`

**Interfaces:**

- Produces `RouteContext = "generator_landing" | "existing_marketing" | "orion"`, `getCtaPolicy(context)`, and `buildPublicSchema(input): JsonLd[]`.
- `CtaPolicy` contains exactly one `primary`, optional quiet `secondary`, and a `demo` flag. Generator landing uses `/app` at both breakpoints. Existing marketing uses `/app` mobile and the imported `CHROME_WEB_STORE_URL` desktop extension CTA. Orion uses that same imported constant at both breakpoints.
- `JsonLd` is `{ "@context": "https://schema.org"; "@type": string; [key: string]: unknown }`. `buildPublicSchema` returns `WebPage`, `BreadcrumbList`, `SoftwareApplication` with `applicationCategory: "BrowserApplication"` and `operatingSystem: "Web"`, and FAQPage only when supplied FAQ entries are visible on the page.

- [ ] **Step 1: Write failing policy and schema tests.**

```ts
it("builds one primary for each context and uses the existing store constant", () => {
  expect(getCtaPolicy("generator_landing").mobile.primary.href).toBe("/app");
  expect(getCtaPolicy("generator_landing").desktop.primary.href).toBe("/app");
  expect(getCtaPolicy("orion").mobile.primary.href).toBe(CHROME_WEB_STORE_URL);
  expect(getCtaPolicy("orion").desktop.primary.href).toBe(CHROME_WEB_STORE_URL);
  expect(getCtaPolicy("generator_landing").desktop.secondary?.kind).toBe(
    "extension",
  );
});

it("landing_schema_is_web_scoped_and_faq_is_visible", () => {
  const json = JSON.stringify(
    buildPublicSchema({
      locale: "en",
      url: "https://autolister.app/vinted-listing-generator",
      faq: [{ question: "Q", answer: "A", visible: true }],
    }),
  );
  expect(json).toContain('"@type":"SoftwareApplication"');
  expect(json).toContain('"applicationCategory":"BrowserApplication"');
  expect(json).toContain("BreadcrumbList");
  expect(json).not.toContain("BrowserExtension");
  expect(json).not.toContain("aggregateRating");
  expect(json).not.toContain(CHROME_WEB_STORE_URL);
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `pnpm exec vitest run src/components/__tests__/RouteAwareCta.test.ts`

Expected: FAIL because the pure route policy, typed schema builder, and shared CTA component do not exist.

- [ ] **Step 3: Implement the policy and typed builders.**

Render one filled CTA, quiet text or outline extension link, and optional demo link. Import `CHROME_WEB_STORE_URL` from `src/utils/blog.ts` for extension destinations. Keep policy independent of browser user-agent and Orion runtime state. Build page-scoped schema without extension rating or store URL. Make FAQ entries eligible only when the component also renders their exact visible question and answer.

- [ ] **Step 4: Run unit tests and type-check.**

Run: `pnpm exec vitest run src/components/__tests__/RouteAwareCta.test.ts && pnpm run type-check`

Expected: PASS. The policy and schema tests prove exact web schema, no extension claims, visible FAQ gating, and one primary per route context.

- [ ] **Step 5: Commit the shared foundation.**

```bash
git add src/utils/routeContext.ts src/components/RouteAwareCta.astro src/utils/publicSchema.ts src/components/__tests__/RouteAwareCta.test.ts
git commit -m "feat: add route-aware acquisition CTA policy"
```

### Task 2: Eight-locale landing model, routes, and initial HTML

**Prerequisites:** Task 1 and the app-client Task 6 route/component contract. The public route can be developed with static placeholders only until Task 3's approved sample evidence exists; it cannot be published before the client gates.

**Files:**

- Create: `src/i18n/mobileListingGenerator.ts`
- Create: `src/components/MobileListingGeneratorLanding.astro`
- Create: `src/components/MobileListingGeneratorSample.astro`
- Create: `src/pages/vinted-listing-generator.astro`
- Create: `src/pages/[lang]/vinted-listing-generator.astro`
- Create: `src/pages/__tests__/mobileListingGenerator.test.ts`

**Interfaces:**

- Produces `MOBILE_LISTING_GENERATOR_LOCALES = ["en", "fr", "de", "nl", "pl", "es", "it", "pt"] as const`, `getMobileListingGeneratorCopy(locale)`, `getMobileListingGeneratorPath(locale)`, and `getMobileListingGeneratorAlternates()`.
- `LandingCopy` includes localized title, description, H1, intro, examples, FAQ, signup copy, five-free-lifetime-generations copy, primary CTA, quiet extension CTA, breadcrumb, and sample disclosure.
- Consumes `SUPPORTED_SITE_LOCALES`, `localizedPath`, `RouteAwareCta`, `buildPublicSchema`, and app-client shared components. It does not consume `LISTING_GUIDE_SLUGS` and does not call an API at render time.

- [ ] **Step 1: Write failing route-model tests.**

```ts
it("landing_routes_have_reciprocal_hreflang_and_are_not_guides", () => {
  expect(MOBILE_LISTING_GENERATOR_LOCALES).toEqual([
    "en",
    "fr",
    "de",
    "nl",
    "pl",
    "es",
    "it",
    "pt",
  ]);
  expect(
    MOBILE_LISTING_GENERATOR_LOCALES.map(getMobileListingGeneratorPath),
  ).toEqual([
    "/vinted-listing-generator",
    "/fr/vinted-listing-generator",
    "/de/vinted-listing-generator",
    "/nl/vinted-listing-generator",
    "/pl/vinted-listing-generator",
    "/es/vinted-listing-generator",
    "/it/vinted-listing-generator",
    "/pt/vinted-listing-generator",
  ]);
  expect(LISTING_GUIDE_SLUGS).not.toContain("vinted-listing-generator");
  expect(getMobileListingGeneratorAlternates()).toHaveLength(9);
});

it("copy records are distinct and state the signup requirement", () => {
  const records = MOBILE_LISTING_GENERATOR_LOCALES.map(
    getMobileListingGeneratorCopy,
  );
  expect(new Set(records.map((record) => record.title)).size).toBe(8);
  expect(records.every((record) => record.signupCopy.length > 0)).toBe(true);
  expect(records.every((record) => record.freeGenerationCopy.length > 0)).toBe(
    true,
  );
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `pnpm exec vitest run src/pages/__tests__/mobileListingGenerator.test.ts`

Expected: FAIL because the typed copy model, alternates, and landing routes do not exist.

- [ ] **Step 3: Implement human-quality locale records and static paths.**

Write complete natural copy for all eight locales, including distinct title, H1, description, examples, visible FAQ, signup truth, five free lifetime generations statement, sample disclosure, and CTA labels. Render English at the root and the other seven locales through `getStaticPaths`. Keep route slugs in this family separate from guide slugs.

- [ ] **Step 4: Implement initial HTML and metadata.**

Render product explanation, one filled `/app` CTA, quiet extension link, approved-sample slot, examples, visible FAQ, signup truth, and internal links before client JavaScript. Emit absolute self canonical, reciprocal eight-locale alternates plus x-default, page-scoped schema from Task 1, and no public schema from the app shell. Use no trailing slash in canonical values without changing public route serving.

- [ ] **Step 5: Run route tests and built-output inspection.**

Run: `pnpm exec vitest run src/pages/__tests__/mobileListingGenerator.test.ts && pnpm run build`

Expected: PASS. Built English and localized HTML contains the localized H1, FAQ, signup text, five-free-generation truth, disclosure slot, canonical, and alternate links before client JavaScript. Later tests inspect the built output, not source strings.

- [ ] **Step 6: Commit the landing family.**

```bash
git add src/i18n/mobileListingGenerator.ts src/components/MobileListingGeneratorLanding.astro src/components/MobileListingGeneratorSample.astro src/pages/vinted-listing-generator.astro 'src/pages/[lang]/vinted-listing-generator.astro' src/pages/__tests__/mobileListingGenerator.test.ts
git commit -m "feat: add localized web generator landing family"
```

### Task 3: Real-backend sample artifact and manual approval evidence

**Prerequisites:** Task 2 and app-client Task 6. No public sample is approved from a prototype screenshot or fabricated result.

**Files:**

- Create: `src/data/mobileListingGeneratorSample.ts`
- Create: `public/landing-samples/vinted-listing-generator/approved-item.jpg`
- Modify: `src/components/MobileListingGeneratorSample.astro: manifest binding and disclosure`
- Modify: `src/pages/__tests__/mobileListingGenerator.test.ts: static manifest shape`

**Interfaces:**

- Produces `APPROVED_MOBILE_LISTING_SAMPLE` with `{ source, generatedAt, itemLabel, imagePath, title, description, outputLanguage, disclosure, evidence }`. `evidence` records a release approval record or log path and review date; it is not an API field and is not asserted as backend provenance by automated tests.
- Consumes a real authenticated staging `/api/phone-upload` plus one-call `/api/generate` result and the app-client read-only component props. It never adds a public generation endpoint.

- [ ] **Step 1: Write the failing static manifest test.**

```ts
it("sample_requires_manual_backend_evidence", () => {
  expect(APPROVED_MOBILE_LISTING_SAMPLE.source).toBe("staging_api_generate");
  expect(APPROVED_MOBILE_LISTING_SAMPLE.imagePath).toBe(
    "/landing-samples/vinted-listing-generator/approved-item.jpg",
  );
  expect(APPROVED_MOBILE_LISTING_SAMPLE.title.length).toBeGreaterThan(0);
  expect(APPROVED_MOBILE_LISTING_SAMPLE.description.length).toBeGreaterThan(0);
  expect(APPROVED_MOBILE_LISTING_SAMPLE.disclosure.toLowerCase()).toContain(
    "sample",
  );
  expect(
    APPROVED_MOBILE_LISTING_SAMPLE.evidence.recordPath.length,
  ).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the artifact test to verify RED.**

Run: `pnpm exec vitest run src/pages/__tests__/mobileListingGenerator.test.ts -t sample_requires_manual_backend_evidence`

Expected: FAIL because the manifest and reviewed image do not exist. This is an implementation gate, not permission to fabricate a result.

- [ ] **Step 3: Obtain and record the real sample through the authorized staging workflow.**

The release owner uses an authenticated staging account and the real upload plus `/api/generate` flow for one disclosed sample item. Save the backend-prepared image and exact returned title and description, record the generation timestamp and manual reviewer record or log path in the manifest, and verify that the visible disclosure says the UI is an approved sample. Do not use production credentials, visitor requests, anonymous generation, signed URLs, tokens, raw credential-bearing responses, prototype-only assets, or an invented approval-identifier request field.

- [ ] **Step 4: Bind the manifest to read-only shared components.**

Pass the reviewed image and exact output into `WorkspaceShell` sample mode, render disclosure beside the sample, and omit auth, Supabase, upload, generation, Stripe, and analytics transport from the public page. The sample is static build content after the manual approval record exists.

- [ ] **Step 5: Run artifact, build, and privacy checks.**

Run: `pnpm exec vitest run src/pages/__tests__/mobileListingGenerator.test.ts -t sample_requires_manual_backend_evidence && pnpm run build && if rg -n 'api/generate|phone-upload|signed|Bearer|supabase' dist/vinted-listing-generator dist/fr/vinted-listing-generator; then exit 1; fi`

Expected: PASS for the manifest and build. The conditional `rg` check exits successfully only when no visitor-generation, upload, signed-URL, bearer, or Supabase reference is present in the public output.

- [ ] **Step 6: Commit only the approved sample files.**

```bash
git add src/data/mobileListingGeneratorSample.ts public/landing-samples/vinted-listing-generator/approved-item.jpg src/components/MobileListingGeneratorSample.astro src/pages/__tests__/mobileListingGenerator.test.ts
git commit -m "feat: add approved web generator sample"
```

### Task 4: Route-aware nav, internal links, app attribution, and CTA integration

**Prerequisites:** Tasks 1 through 3 and app-client Task 6. This task owns existing marketing surface modifications; it does not modify app-client components or routes.

**Files:**

- Create: `src/utils/appLink.ts`
- Create: `src/pages/__tests__/acquisitionLinks.test.ts`
- Modify: `src/layouts/SiteLayout.astro: route-aware nav props and extension schema opt-out`
- Modify: `src/components/HomeLanding.astro: hard-coded hero and final CTA surfaces`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/[lang]/index.astro`
- Modify: `src/pages/pricing.astro`
- Modify: `src/pages/[lang]/pricing.astro`
- Modify: `src/components/PricingPage.astro`
- Modify: `src/pages/vinted-description-generator.astro`
- Modify: `src/components/ListingGuide.astro`
- Modify: `src/components/blog/InlineCTA.astro`
- Modify: `src/components/blog/EndOfPostCTA.astro`
- Modify: `src/components/blog/PhotoToListingCTA.astro`
- Modify: `src/components/blog/WritingStyleCTA.astro`
- Modify: `src/pages/vinted-extension-iphone-orion.astro`

**Interfaces:**

- `buildAppHref(input: { locale?: string; ref?: string; utm?: Record<string, string>; context: string; placement: string }): string` accepts only approved attribution keys and returns a same-origin `/app` href. `buildWebAppClickContext(input)` returns bounded locale, source path, route context, CTA placement, and sample/hero placement values.
- `SiteLayout` accepts additive route context, app href, and `includeExtensionSchema` props with defaults that preserve existing pages. Its desktop nav and mobile menu cannot emit two filled primaries.
- Blog copy and links support only the four existing blog locales en, fr, de, and nl. The eight landing locales are not implied for blog content.

- [ ] **Step 1: Write failing built-surface and attribution tests.**

```ts
it("cta_policy_has_one_primary_and_preserves_orion", () => {
  const home = readFileSync("src/components/HomeLanding.astro", "utf8");
  const siteLayout = readFileSync("src/layouts/SiteLayout.astro", "utf8");
  const orion = readFileSync(
    "src/pages/vinted-extension-iphone-orion.astro",
    "utf8",
  );
  expect(home).toContain("RouteAwareCta");
  expect(siteLayout).toContain("routeContext");
  expect(orion).toContain("CHROME_WEB_STORE_URL");
  expect(orion).toContain("after");
});

it("sanitizes app links and preserves only approved attribution", () => {
  expect(
    buildAppHref({
      locale: "fr",
      ref: "guide",
      utm: { utm_source: "blog", evil: "drop" },
      context: "home",
      placement: "hero",
    }),
  ).toBe("/app?ref=guide&utm_source=blog");
  expect(
    buildWebAppClickContext({
      locale: "fr",
      sourcePath: "/fr",
      routeContext: "existing_marketing",
      placement: "hero",
    }),
  ).toEqual(
    expect.objectContaining({
      locale: "fr",
      routeContext: "existing_marketing",
    }),
  );
});
```

- [ ] **Step 2: Run the focused test to verify RED.**

Run: `pnpm exec vitest run src/pages/__tests__/acquisitionLinks.test.ts`

Expected: FAIL because nav and home CTAs are still hard-coded and no sanitized app-link helper exists.

- [ ] **Step 3: Implement route-aware nav and home CTA policy.**

Pass route context into `SiteLayout` and replace the current filled Chrome links in desktop nav and mobile menu with policy-driven markup. Update `HomeLanding.astro` hero and final CTAs as well as its other CTA surface so mobile has one filled `/app` primary with a quiet extension link, while desktop keeps the extension primary and demo and exposes the web app only as a small nav or text link. New generator landing pages use `/app` as the single filled primary on both breakpoints. Orion imports `CHROME_WEB_STORE_URL`, remains extension-primary, and receives only a subtle web alternative after instructions. Do not use user-agent, extension, or Orion detection.

- [ ] **Step 4: Add locale links and the new sanitized app-link layer.**

Link homepage, both pricing routes, `/vinted-description-generator`, localized guides, and blog CTA surfaces to the matching landing path. For blog links use only en, fr, de, and nl paths. Preserve current extension CTAs and page intent. Build `/app` hrefs through `buildAppHref`, preserve first-touch/ref/approved UTM values, and emit bounded `web_app_click` context without email, image, generated text, or arbitrary query keys. The feature flag is checked before filled web CTAs are enabled; existing extension CTAs remain available when mobile web is disabled.

- [ ] **Step 5: Run link, CTA, build, and type checks.**

Run: `pnpm exec vitest run src/pages/__tests__/acquisitionLinks.test.ts src/components/__tests__/RouteAwareCta.test.ts && pnpm run build && pnpm run type-check`

Expected: PASS. Existing extension links remain valid, route contexts produce one filled primary, Orion stays extension-first, locale links target matching routes, and sanitized attribution survives in built hrefs.

- [ ] **Step 6: Commit existing-surface integration.**

```bash
git add src/utils/appLink.ts src/layouts/SiteLayout.astro src/components/HomeLanding.astro src/pages/index.astro 'src/pages/[lang]/index.astro' src/pages/pricing.astro 'src/pages/[lang]/pricing.astro' src/components/PricingPage.astro src/pages/vinted-description-generator.astro src/components/ListingGuide.astro src/components/blog/InlineCTA.astro src/components/blog/EndOfPostCTA.astro src/components/blog/PhotoToListingCTA.astro src/components/blog/WritingStyleCTA.astro src/pages/vinted-extension-iphone-orion.astro src/pages/__tests__/acquisitionLinks.test.ts
git commit -m "feat: connect localized mobile acquisition paths"
```

### Task 5: Sitemap, private noindex boundaries, built-output SEO checks, and release gate

**Prerequisites:** Tasks 1 through 4 and the app-client route output. This task owns sitemap and public SEO validation only; it does not modify app components or routes. If a private route test finds a demonstrated app contract bug, coordinate that fix with the app plan rather than changing app ownership here.

**Files:**

- Modify: `astro.config.mjs: normalized sitemap filter`
- Modify: `src/pages/customer-usage.astro: noindex metadata`
- Test: `src/pages/__tests__/acquisitionSeo.test.ts`
- Test: built output from `src/pages/vinted-listing-generator.astro`, localized route, `src/pages/auth/callback.html`, and app routes

**Interfaces:**

- `normalizePublicPath(input: string): string` strips query, hash, and trailing slash except for `/`; sitemap serialization uses the same normalized no-trailing-slash representation without changing how public routes are served.
- The sitemap includes all eight public landings and excludes `/app`, `/app/auth/callback`, `/auth/callback`, `/customer-usage`, and the existing known private exclusions. Filter input is normalized before comparison.
- Built output tests reject `applicationCategory: "BrowserExtension"`, any `aggregateRating` on the landing family, and the imported `CHROME_WEB_STORE_URL` in landing page JSON-LD. They assert the browser schema values instead of source-string copies.

- [ ] **Step 1: Write failing built-output tests.**

```ts
it("sitemap_includes_landings_and_excludes_private_routes", () => {
  const sitemap = readFileSync("dist/sitemap-0.xml", "utf8");
  for (const path of [
    "/vinted-listing-generator",
    "/fr/vinted-listing-generator",
    "/de/vinted-listing-generator",
    "/nl/vinted-listing-generator",
    "/pl/vinted-listing-generator",
    "/es/vinted-listing-generator",
    "/it/vinted-listing-generator",
    "/pt/vinted-listing-generator",
  ])
    expect(sitemap).toContain(`https://autolister.app${path}`);
  for (const path of [
    "/app",
    "/app/auth/callback",
    "/auth/callback",
    "/customer-usage",
  ])
    expect(sitemap).not.toContain(path);
  expect(sitemap).not.toContain("/vinted-listing-generator/");
});

it("built landing metadata is web-scoped and private documents are noindex", () => {
  const landing = readFileSync(
    "dist/vinted-listing-generator/index.html",
    "utf8",
  );
  const localized = readFileSync(
    "dist/fr/vinted-listing-generator/index.html",
    "utf8",
  );
  const app = readFileSync("dist/app/index.html", "utf8");
  const callback = readFileSync("dist/auth/callback.html", "utf8");
  const usage = readFileSync("dist/customer-usage/index.html", "utf8");
  expect((landing.match(/hreflang=/g) || []).length).toBe(9);
  expect(landing).toContain(
    'rel="canonical" href="https://autolister.app/vinted-listing-generator"',
  );
  expect(localized).toContain(
    'rel="canonical" href="https://autolister.app/fr/vinted-listing-generator"',
  );
  expect(landing).toContain('"@type":"SoftwareApplication"');
  expect(landing).toContain('"applicationCategory":"BrowserApplication"');
  expect(landing).not.toContain('"applicationCategory":"BrowserExtension"');
  expect(landing).not.toContain("aggregateRating");
  expect(landing).not.toContain(CHROME_WEB_STORE_URL);
  for (const html of [app, callback, usage])
    expect(html).toContain('name="robots" content="noindex, nofollow"');
});
```

- [ ] **Step 2: Run the built-output test to verify RED.**

Run: `pnpm run build && pnpm exec vitest run src/pages/__tests__/acquisitionSeo.test.ts`

Expected: FAIL because the current sitemap filter does not cover every approved private route, customer usage lacks noindex, and new landing metadata is not complete.

- [ ] **Step 3: Implement normalized sitemap filtering and private metadata.**

Add `normalizePublicPath` to the sitemap filter, preserve the current exclusion list, add only `/app`, `/app/auth/callback`, `/auth/callback`, and `/customer-usage`, and serialize public URLs without trailing slash. Add noindex to `customer-usage.astro`; preserve the existing callback noindex. Do not block the entire site in `robots.txt`. The landing route remains public and indexable.

- [ ] **Step 4: Validate rendered metadata, schema, and copy parity.**

Build before assertions. Inspect all eight built landing files for unique localized H1, visible FAQ text, signup truth, sample disclosure, absolute self canonical, nine alternates, x-default, and no trailing slash. Assert schema from rendered HTML, not source strings. Validate that the FAQ JSON-LD questions and answers are visible body content, that no extension schema or store URL leaks into landing JSON-LD, and that `SiteLayout` defaults still preserve existing extension schema on non-landing pages.

- [ ] **Step 5: Run lab performance and release checks without claiming field p75.**

Run: `pnpm run build && pnpm exec vitest run src/pages/__tests__/acquisitionSeo.test.ts src/pages/__tests__/mobileListingGenerator.test.ts src/pages/__tests__/acquisitionLinks.test.ts && pnpm run verify:production && pnpm run preview -- --host 0.0.0.0`

Expected: PASS. Use the preview with Chrome DevTools Lighthouse mobile preset for three runs on representative English and localized routes. Approve only LCP at or below 2.5 seconds, CLS at or below 0.1, initial JavaScript transfer at or below 150 KB compressed, initial HTML content parity, and no generation request before CTA readiness. Record real field p75 LCP and CLS after launch separately; local preview cannot prove it.

- [ ] **Step 6: Run post-release verification only after explicit approval.**

Inspect representative mobile and desktop routes, validate JSON-LD with the chosen structured-data validator, verify one filled primary per route context, check internal links and attribution, and record evidence in the existing growth QA record. After a separately approved production release, use Search Console URL Inspection and structured-data checks for the English and one localized route. These checks measure discoverability and correctness, not rankings or traffic.

- [ ] **Step 7: Commit only acquisition SEO files.**

```bash
git add astro.config.mjs src/pages/customer-usage.astro src/pages/__tests__/acquisitionSeo.test.ts
git commit -m "feat: finalize mobile acquisition SEO boundaries"
```

## Release and rollback boundary

The implementation order is Task 1, Task 2, Task 3, Task 4, then Task 5. The backend server contracts, app-client feature flag, approved sample evidence, and iPhone Safari and Android Chrome gates are prerequisites. Preview must pass the repository verification command, built-output SEO checks, sample privacy checks, lab performance budgets, and CTA policy checks before public routes or filled app CTAs are exposed. Production rollout and Search Console verification are separate approved release actions. If a gate fails, keep existing extension CTAs and public pages, leave the app CTA disabled, and remove only the new landing routes from the sitemap through a reviewed revert. Do not delete an idempotency migration, alter subscriptions, reset quotas, change extension callbacks, or change Orion runtime behavior during rollback.

## Non-goals carried into implementation

This plan does not add seller-note sync, history, batch generation, offline storage, a service worker, IndexedDB, a share target, native Vinted handoff, anonymous generation, guest quota, visitor uploads, public pages for the 18 output languages, a new pricing model, a new Stripe product, or replacement of any existing extension, description, guide, ChatGPT, or Orion page.
