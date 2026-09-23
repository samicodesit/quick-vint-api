# Mobile Web Acquisition SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight distinct, indexable Vinted listing-generator landing pages that turn search and existing site traffic into the authenticated `/app` flow while preserving extension-first intent, schema, locale, and Orion behavior.

**Architecture:** A separate typed landing-copy model drives the English root and seven localized routes. A route-aware CTA abstraction determines one filled primary per route and breakpoint, while page-scoped schema explicitly suppresses the global Chrome-extension schema on the new family. The public sample is a reviewed static artifact rendered through the app's shared mobile-web components, so it proves the product without visitor uploads, anonymous generation, or fake success state.

**Tech Stack:** Astro 5 static routes, TypeScript 5.8, existing `SiteLayout.astro`, `localizedPath`, `SUPPORTED_SITE_LOCALES`, `@astrojs/sitemap`, existing Tailwind Vite CSS, JSON-LD, Vitest 4, static build and preview checks.

**Spec:** `docs/superpowers/specs/2026-09-23-mobile-web-app-phase-1-design.md`

## Global Constraints

- The landing family is exactly `/vinted-listing-generator`, `/fr/vinted-listing-generator`, `/de/vinted-listing-generator`, `/nl/vinted-listing-generator`, `/pl/vinted-listing-generator`, `/es/vinted-listing-generator`, `/it/vinted-listing-generator`, and `/pt/vinted-listing-generator`; English is x-default.
- These are separate commercial pages, not `LISTING_GUIDE_SLUGS` and not replacements for existing extension, description, template, checklist, photo-to-listing, ChatGPT, or Orion pages.
- Each route has unique human-quality localized title, H1, description, examples, FAQ, and CTA copy, initial HTML product content, mobile content parity, an absolute self canonical, reciprocal eight-locale hreflang plus x-default, and sitemap inclusion.
- A public sample uses the app's real mobile-web UI components and a disclosed item, photo, title, and description produced by the actual AutoLister backend and approved before publication.
- Public pages never accept visitor photos, call generation anonymously, create guest quota, show fake success state, or imply seller-note, history, batch, offline, share-target, or native Vinted support.
- The landing family uses one filled `/app` CTA on both mobile and desktop. Existing marketing surfaces use `/app` filled on mobile but preserve extension-primary desktop behavior. Orion is extension-primary on every viewport and may mention web only after instructions.
- CTA policy is route context plus CSS breakpoint, never user-agent sniffing, extension detection, or Orion detection. No viewport shows two filled primary CTAs.
- New landing pages use page-scoped `WebPage`, `BreadcrumbList`, accurate browser `SoftwareApplication`, and visible-FAQ-only `FAQPage` data. They do not inherit the global Chrome-extension schema, Chrome Web Store claims, or unsupported aggregate rating.
- `/app`, `/app/auth/callback`, `/auth/callback`, and private account paths remain noindex and excluded from the sitemap. `robots.txt` remains crawlable so crawlers can observe noindex.
- The 18 output languages remain authenticated product controls, not public SEO route variants.
- Matching locale internal links preserve existing ref, UTM, first-touch, source route, locale, CTA placement, and `web_app_click` analytics context.
- Public pages must meet the launch budgets of mobile p75 LCP at or below 2.5 seconds and CLS at or below 0.1, with no generation request or large app bundle required before initial content and CTA are usable.
- Do not claim rankings, traffic, conversion, or native app opening. Discoverability and outcomes are measured after release.
- Do not publish a route, sample, or CTA before the app-client plan's iPhone Safari and Android Chrome gates pass. Do not deploy or submit a production Search Console change from implementation tasks.
- Run commands from `/home/mests/projects/quick-vint-api`; preserve unrelated dirty files and stage only files owned by the current task.

## Review Focus

1. A landing route must have reciprocal alternate links and x-default without slipping into the existing guide slug map. Pin this to `landing_routes_have_reciprocal_hreflang_and_are_not_guides` in Task 2.
2. The new page must not emit the global Chrome-extension schema or an invisible FAQ schema. Pin this to `landing_schema_is_web_scoped_and_faq_is_visible` in Task 1.
3. CTA policy must yield exactly one filled primary at each route and breakpoint while Orion remains extension-first. Pin this to `cta_policy_has_one_primary_and_preserves_orion` in Task 1.
4. The sample must carry backend approval metadata and never expose an anonymous generation path. Pin this to `sample_requires_backend_verified_artifact` in Task 3.
5. Sitemap and noindex boundaries must survive Astro's trailing-slash normalization and include all eight public routes. Pin this to `sitemap_includes_landings_and_excludes_private_routes` in Task 5.

---

## File structure map

| File                                                                                                            | Responsibility                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/RouteAwareCta.astro`                                                                            | Shared CTA markup and route policy classes for landing, existing marketing, and Orion contexts.                                             |
| `src/utils/routeContext.ts`                                                                                     | Pure route and breakpoint policy returning the single filled primary and quiet secondary links.                                             |
| `src/utils/publicSchema.ts`                                                                                     | Page-scoped WebPage, BreadcrumbList, browser SoftwareApplication, and visible FAQ JSON-LD builders.                                         |
| `src/layouts/SiteLayout.astro`                                                                                  | Additive `includeExtensionSchema` and CTA integration props, defaulting to current extension schema and nav behavior for existing pages.    |
| `src/i18n/mobileListingGenerator.ts`                                                                            | Typed eight-locale landing copy, alternates, localized CTA labels, FAQ, examples, and route metadata.                                       |
| `src/components/MobileListingGeneratorLanding.astro`                                                            | Initial HTML landing layout, metadata, schema, signup truth, internal links, and route-aware CTA.                                           |
| `src/components/MobileListingGeneratorSample.astro`                                                             | Disclosed static sample rendered through the app's shared `WorkspaceShell`, `PhotoRail`, `ListingControls`, and `ListingResult` components. |
| `src/data/mobileListingGeneratorSample.ts`                                                                      | Backend-verified sample manifest, approval metadata, image path, and exact generated output used by all eight pages.                        |
| `public/landing-samples/vinted-listing-generator/approved-item.jpg`                                             | Reviewed sample photo produced or prepared through the real backend workflow.                                                               |
| `src/pages/vinted-listing-generator.astro`                                                                      | English x-default route.                                                                                                                    |
| `src/pages/[lang]/vinted-listing-generator.astro`                                                               | Seven localized static routes, limited to supported site locales.                                                                           |
| `src/components/__tests__/RouteAwareCta.test.ts`                                                                | CTA policy and schema isolation unit tests.                                                                                                 |
| `src/pages/__tests__/mobileListingGenerator.test.ts`                                                            | Locale model, route, copy uniqueness, sample, and initial HTML tests.                                                                       |
| `src/pages/__tests__/acquisitionLinks.test.ts`                                                                  | Internal link, attribution, route-context, and Orion preservation tests.                                                                    |
| `src/pages/__tests__/acquisitionSeo.test.ts`                                                                    | Build-output canonical, hreflang, schema, sitemap, noindex, trailing-slash, and private-route tests.                                        |
| `astro.config.mjs`                                                                                              | Additive sitemap exclusion for private app, callback, and account paths while retaining public landing routes.                              |
| `src/pages/index.astro`, `src/pages/[lang]/index.astro`                                                         | Matching-locale browser-app CTA and landing internal link.                                                                                  |
| `src/components/PricingPage.astro`                                                                              | Matching-locale landing link and route-aware CTA placement.                                                                                 |
| `src/pages/vinted-description-generator.astro`                                                                  | English related landing link while retaining extension-first intent.                                                                        |
| `src/components/ListingGuide.astro`                                                                             | Matching-locale related landing link and responsive CTA.                                                                                    |
| `src/components/blog/InlineCTA.astro`, `EndOfPostCTA.astro`, `PhotoToListingCTA.astro`, `WritingStyleCTA.astro` | Route-aware blog conversion links with quiet extension preservation.                                                                        |
| `src/pages/vinted-extension-iphone-orion.astro`                                                                 | Extension-first CTA unchanged, with only a post-instruction subtle web alternative.                                                         |

## Dependencies and execution order

The app-client plan must complete and pass preview plus iPhone Safari and Android Chrome gates before this plan publishes a filled `/app` CTA or an approved sample. Task 1 is the shared policy and schema foundation. Task 2 consumes Task 1 and produces the eight routes. Task 3 consumes Task 2 and the app client's shared component interfaces, and cannot pass until a real backend-generated sample is approved. Task 4 updates existing sources with the shared CTA and matching links. Task 5 consumes all prior tasks and validates the built output, sitemap, noindex boundaries, and release checks. Backend foundation endpoints are not called by public pages.

### Task 1: Route-aware CTA and page-scoped schema foundation

**Files:**

- Create: `src/utils/routeContext.ts`
- Create: `src/components/RouteAwareCta.astro`
- Create: `src/utils/publicSchema.ts`
- Create: `src/components/__tests__/RouteAwareCta.test.ts`
- Modify: `src/layouts/SiteLayout.astro: optional extension schema and nav CTA props`

**Interfaces:**

- Produces `RouteContext = "generator_landing" | "existing_marketing" | "orion"`, `getCtaPolicy(context: RouteContext): { mobile: CtaPolicy; desktop: CtaPolicy }`, and `buildPublicSchema(input): JsonLd[]`.
- `CtaPolicy` contains exactly one `primary: { href: string; label: string }`, optional `secondary`, and `demo: boolean`. `generator_landing` uses `/app` primary at both breakpoints; `existing_marketing` uses `/app` mobile and extension desktop; `orion` uses extension primary at both breakpoints.
- `SiteLayout` keeps `includeExtensionSchema=true` by default. New landing pages pass `false` and add only `buildPublicSchema` output. Existing pages keep current global schema unless their route CTA is explicitly adapted.

- [ ] **Step 1: Write failing tests for CTA policy and schema isolation.**

```ts
it("has one filled primary and keeps Orion extension-first", () => {
  expect(getCtaPolicy("generator_landing").mobile.primary.href).toBe("/app");
  expect(getCtaPolicy("generator_landing").desktop.primary.href).toBe("/app");
  expect(getCtaPolicy("orion").mobile.primary.href).toContain(
    "chrome.google.com",
  );
  expect(getCtaPolicy("orion").desktop.primary.href).toContain(
    "chrome.google.com",
  );
  expect(getCtaPolicy("generator_landing").desktop.secondary?.kind).toBe(
    "extension",
  );
});

it("builds browser schema without Chrome extension claims", () => {
  const json = JSON.stringify(
    buildPublicSchema({
      locale: "en",
      url: "https://autolister.app/vinted-listing-generator",
      faq: [{ question: "Q", answer: "A" }],
    }),
  );
  expect(json).toContain("BrowserApplication");
  expect(json).toContain("BreadcrumbList");
  expect(json).not.toContain("BrowserExtension");
  expect(json).not.toContain("Chrome Web Store");
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run src/components/__tests__/RouteAwareCta.test.ts`

Expected: FAIL because no route policy or page-scoped schema builder exists and `SiteLayout` always emits its current extension schema.

- [ ] **Step 3: Implement pure policy, schema, and opt-out prop.**

Implement route policy as data, not user-agent logic. Render one filled CTA class, a quiet text or outline extension link, and optional demo link. Add `includeExtensionSchema?: boolean` to `SiteLayout` with the existing behavior as the default. `buildPublicSchema` returns WebPage, BreadcrumbList, browser SoftwareApplication with `applicationCategory: "BrowserApplication"` and `operatingSystem: "Web"` only if the validator accepts it, and FAQPage only for visible FAQ entries. Never include the current Chrome Web Store rating in the browser object.

- [ ] **Step 4: Run unit tests and type-check.**

Run: `npx vitest run src/components/__tests__/RouteAwareCta.test.ts && npm run type-check`

Expected: PASS, with existing pages retaining their default extension schema and the new policy exposing exactly one filled primary per route context.

- [ ] **Step 5: Commit the shared foundation.**

```bash
git add src/utils/routeContext.ts src/components/RouteAwareCta.astro src/utils/publicSchema.ts src/components/__tests__/RouteAwareCta.test.ts src/layouts/SiteLayout.astro
git commit -m "feat: add route-aware acquisition CTA policy"
```

### Task 2: Localized landing model, routes, and initial HTML

**Files:**

- Create: `src/i18n/mobileListingGenerator.ts`
- Create: `src/components/MobileListingGeneratorLanding.astro`
- Create: `src/components/MobileListingGeneratorSample.astro`
- Create: `src/pages/vinted-listing-generator.astro`
- Create: `src/pages/[lang]/vinted-listing-generator.astro`
- Test: `src/pages/__tests__/mobileListingGenerator.test.ts`

**Interfaces:**

- Produces `MOBILE_LISTING_GENERATOR_LOCALES = ["en", "fr", "de", "nl", "pl", "es", "it", "pt"] as const`, `getMobileListingGeneratorCopy(locale)`, `getMobileListingGeneratorPath(locale)`, and `getMobileListingGeneratorAlternates()`.
- `LandingCopy` includes localized `title`, `description`, `h1`, `intro`, `examples`, `faq`, `signupCopy`, `freeGenerationCopy`, `primaryCta`, `quietExtensionCta`, `breadcrumb`, and `sampleDisclosure`.
- Consumes `SUPPORTED_SITE_LOCALES`, `localizedPath`, `RouteAwareCta`, `buildPublicSchema`, and the app-client shared mobile-web components. It does not consume `LISTING_GUIDE_SLUGS` or call any API at render time.

- [ ] **Step 1: Write failing tests for all eight routes, unique copy, alternates, and initial HTML requirements.**

```ts
it("defines eight separate commercial routes", () => {
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
  expect(
    new Set(
      MOBILE_LISTING_GENERATOR_LOCALES.map(
        (locale) => getMobileListingGeneratorCopy(locale).title,
      ),
    ).size,
  ).toBe(8);
});

it("renders signup truth, sample disclosure, and eight alternates in initial markup", () => {
  const source = readFileSync(
    "src/components/MobileListingGeneratorLanding.astro",
    "utf8",
  );
  expect(source).toContain("five free lifetime generations");
  expect(source).toContain("sampleDisclosure");
  expect(source).toContain("hreflang");
});
```

- [ ] **Step 2: Run the route test to verify it fails.**

Run: `npx vitest run src/pages/__tests__/mobileListingGenerator.test.ts`

Expected: FAIL because the typed copy model and landing routes do not exist.

- [ ] **Step 3: Implement human-quality localized copy and static paths.**

Define eight complete copy records, not machine-translated filler: title, H1, description, product explanation, examples, visible FAQ, signup requirement, five-free-lifetime-generations statement, sample disclosure, and CTA labels must be unique and natural in each locale. Use `getStaticPaths` only for the seven non-English locale params and render English at the root. Build absolute self canonical and reciprocal alternate links for all eight routes plus x-default, with the existing no-trailing-slash route helper.

- [ ] **Step 4: Implement initial HTML and the approved UI component mount.**

Render the hero, one filled `/app` CTA, quiet extension link, product explanation, approved-sample slot, examples, visible FAQ, signup truth, and internal links in Astro HTML before any client script. `MobileListingGeneratorSample.astro` composes the app-client `WorkspaceShell`, `PhotoRail`, `ListingControls`, and `ListingResult` in read-only mode and displays the manifest's disclosure. Do not import app auth, upload, generation, Supabase, or Stripe code into the public page.

- [ ] **Step 5: Run route tests, build, and inspect initial output.**

Run: `npx vitest run src/pages/__tests__/mobileListingGenerator.test.ts && npm run build`

Expected: PASS. `dist/vinted-listing-generator/index.html` and all seven localized files contain localized H1, FAQ, signup copy, sample disclosure, canonical, and alternate links before client JavaScript runs.

- [ ] **Step 6: Commit the landing family.**

```bash
git add src/i18n/mobileListingGenerator.ts src/components/MobileListingGeneratorLanding.astro src/components/MobileListingGeneratorSample.astro src/pages/vinted-listing-generator.astro 'src/pages/[lang]/vinted-listing-generator.astro' src/pages/__tests__/mobileListingGenerator.test.ts
git commit -m "feat: add localized web generator landing family"
```

### Task 3: Backend-verified public sample artifact

**Files:**

- Create: `src/data/mobileListingGeneratorSample.ts`
- Create: `public/landing-samples/vinted-listing-generator/approved-item.jpg`
- Test: `src/pages/__tests__/mobileListingGenerator.test.ts`
- Modify: `src/components/MobileListingGeneratorSample.astro: manifest binding`

**Interfaces:**

- Produces `APPROVED_MOBILE_LISTING_SAMPLE` with `{ approvalId, source: "staging_api_generate", generatedAt, itemLabel, imagePath, title, description, outputLanguage, disclosure }`.
- Consumes the actual backend output from the authenticated staging `/api/generate` path, the approved image preparation rules, and the app-client read-only component props. It never adds a public generation endpoint.

- [ ] **Step 1: Add the failing artifact contract test.**

```ts
it("requires a backend-verified approved sample artifact", () => {
  expect(APPROVED_MOBILE_LISTING_SAMPLE.source).toBe("staging_api_generate");
  expect(APPROVED_MOBILE_LISTING_SAMPLE.approvalId).toMatch(
    /^sample-[a-z0-9-]+$/,
  );
  expect(APPROVED_MOBILE_LISTING_SAMPLE.imagePath).toBe(
    "/landing-samples/vinted-listing-generator/approved-item.jpg",
  );
  expect(APPROVED_MOBILE_LISTING_SAMPLE.title.length).toBeGreaterThan(0);
  expect(APPROVED_MOBILE_LISTING_SAMPLE.description.length).toBeGreaterThan(0);
  expect(APPROVED_MOBILE_LISTING_SAMPLE.disclosure).toContain("sample");
});
```

- [ ] **Step 2: Run the artifact test to verify it fails before approval.**

Run: `npx vitest run src/pages/__tests__/mobileListingGenerator.test.ts -t "backend-verified"`

Expected: FAIL because the approved manifest and image are not present. This failure is intentional until the release owner supplies the real backend-generated artifact.

- [ ] **Step 3: Generate and approve one staging artifact through the existing authenticated backend flow.**

The release owner uses an authenticated staging account and the real `/api/phone-upload` plus `/api/generate` path, with one disclosed sample item, one selected output language, and the normal one-call title and description response. Save the backend-prepared image as `public/landing-samples/vinted-listing-generator/approved-item.jpg`, copy the exact returned title and description into the manifest, record the staging generation time and an approval ID, and verify that the visible disclosure states it is an approved sample. Do not use a production account, anonymous request, fabricated output, prototype-only asset, signed URL, token, or raw API response containing credentials.

- [ ] **Step 4: Bind the manifest and keep the sample static.**

Import `APPROVED_MOBILE_LISTING_SAMPLE` into the sample component, pass the image and exact output into shared read-only result props, and render the disclosure beside the sample. The page must not fetch, generate, upload, authenticate, or mutate state for a visitor. The sample is build-time content after approval.

- [ ] **Step 5: Run artifact, build, and privacy checks.**

Run: `npx vitest run src/pages/__tests__/mobileListingGenerator.test.ts -t "backend-verified" && npm run build && rg -n "api/generate|phone-upload|signed|Bearer|supabase" dist/vinted-listing-generator dist/fr/vinted-listing-generator`

Expected: PASS for the artifact test and build. The final `rg` command returns no visitor-generation, upload, signed-URL, bearer, or Supabase reference in public landing output.

- [ ] **Step 6: Commit only the approved sample files.**

```bash
git add src/data/mobileListingGeneratorSample.ts public/landing-samples/vinted-listing-generator/approved-item.jpg src/components/MobileListingGeneratorSample.astro src/pages/__tests__/mobileListingGenerator.test.ts
git commit -m "feat: add approved web generator sample"
```

### Task 4: Internal links, attribution, and responsive CTA integration

**Files:**

- Create: `src/pages/__tests__/acquisitionLinks.test.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/[lang]/index.astro`
- Modify: `src/components/PricingPage.astro`
- Modify: `src/pages/vinted-description-generator.astro`
- Modify: `src/components/ListingGuide.astro`
- Modify: `src/components/blog/InlineCTA.astro`
- Modify: `src/components/blog/EndOfPostCTA.astro`
- Modify: `src/components/blog/PhotoToListingCTA.astro`
- Modify: `src/components/blog/WritingStyleCTA.astro`
- Modify: `src/pages/vinted-extension-iphone-orion.astro`

**Interfaces:**

- Consumes `RouteAwareCta`, `getCtaPolicy`, `getMobileListingGeneratorPath`, existing `localizedPath`, and existing attribution query helpers.
- Produces matching-locale landing links and app links with preserved `ref`, UTM, and first-touch state. Existing extension CTAs remain available according to route policy. Orion's extension install remains primary.

- [ ] **Step 1: Write failing link and CTA tests.**

```ts
it("links each localized marketing surface to its matching landing route", () => {
  expect(readFileSync("src/pages/[lang]/index.astro", "utf8")).toContain(
    "getMobileListingGeneratorPath",
  );
  expect(readFileSync("src/components/PricingPage.astro", "utf8")).toContain(
    "vinted-listing-generator",
  );
  expect(readFileSync("src/components/ListingGuide.astro", "utf8")).toContain(
    "getMobileListingGeneratorPath",
  );
});

it("keeps Orion extension-first and preserves attribution on app links", () => {
  const orion = readFileSync(
    "src/pages/vinted-extension-iphone-orion.astro",
    "utf8",
  );
  expect(orion).toContain("chrome.google.com");
  expect(orion).toContain("after");
  expect(readFileSync("src/components/RouteAwareCta.astro", "utf8")).toContain(
    "utm",
  );
});
```

- [ ] **Step 2: Run the link test to verify it fails.**

Run: `npx vitest run src/pages/__tests__/acquisitionLinks.test.ts`

Expected: FAIL because existing pages still hard-code extension CTAs and do not expose the matching landing links.

- [ ] **Step 3: Replace only the CTA surfaces with the shared abstraction.**

On the new landing routes, render `/app` as the single filled primary on all breakpoints and the extension as a quiet secondary. On home, guides, blog, and pricing, render `/app` as filled primary on mobile while preserving extension filled primary and demo on desktop. On Orion, retain the current extension primary and place one quiet web link only after the instructions. Use CSS breakpoint classes and route context, never `navigator.userAgent`, Vinted host detection, or Orion runtime detection.

- [ ] **Step 4: Add matching-locale links and preserve attribution.**

Add the landing route to localized homepages, pricing, related resources on `/vinted-description-generator`, localized guides, and relevant blog CTA surfaces. Build `/app` and landing hrefs with the existing sanitized `ref`, UTM, and first-touch query handling. Emit `web_app_click` with source path, locale, route context, CTA placement, and sample-vs-hero placement, without email or image data.

- [ ] **Step 5: Run links, build, and existing CTA tests.**

Run: `npx vitest run src/pages/__tests__/acquisitionLinks.test.ts src/components/__tests__/RouteAwareCta.test.ts && npm run build`

Expected: PASS. Existing extension links remain valid, each supported locale reaches its matching landing route, Orion stays extension-first, and the build has exactly one filled primary per route context and breakpoint class.

- [ ] **Step 6: Commit internal link integration.**

```bash
git add src/pages/index.astro 'src/pages/[lang]/index.astro' src/components/PricingPage.astro src/pages/vinted-description-generator.astro src/components/ListingGuide.astro src/components/blog/InlineCTA.astro src/components/blog/EndOfPostCTA.astro src/components/blog/PhotoToListingCTA.astro src/components/blog/WritingStyleCTA.astro src/pages/vinted-extension-iphone-orion.astro src/pages/__tests__/acquisitionLinks.test.ts
git commit -m "feat: connect localized acquisition paths"
```

### Task 5: Sitemap, noindex boundaries, SEO output checks, and release gate

**Files:**

- Modify: `astro.config.mjs: sitemap filter`
- Create: `src/pages/__tests__/acquisitionSeo.test.ts`
- Modify: `src/components/MobileListingGeneratorLanding.astro: final metadata and schema assertions`
- Modify: `src/pages/app/index.astro: noindex contract if required by build output`
- Modify: `src/pages/app/auth/callback.astro: noindex contract if required by build output`

**Interfaces:**

- Consumes all public routes and schemas from Tasks 1 through 4 plus the app-client private route output.
- Produces sitemap output with all eight public landings and no `/app`, `/app/auth/callback`, `/auth/callback`, or private account route. It keeps the existing crawlable `robots.txt` and one non-home trailing-slash policy.

- [ ] **Step 1: Write failing build-output checks for canonical, hreflang, schema, sitemap, noindex, and trailing slash.**

```ts
it("includes landings and excludes private routes from the generated sitemap", () => {
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
    expect(sitemap).toContain(path);
  for (const path of [
    "/app",
    "/app/auth/callback",
    "/auth/callback",
    "/customer-usage",
  ])
    expect(sitemap).not.toContain(path);
});

it("keeps landing schema web-scoped and app documents noindex", () => {
  const landing = readFileSync(
    "dist/vinted-listing-generator/index.html",
    "utf8",
  );
  const app = readFileSync("dist/app/index.html", "utf8");
  expect(landing.match(/hreflang=/g)?.length).toBe(9);
  expect(landing).toContain(
    'rel="canonical" href="https://autolister.app/vinted-listing-generator"',
  );
  expect(landing).toContain('"@type":"BrowserApplication"');
  expect(landing).not.toContain('"@type":"BrowserExtension"');
  expect(app).toContain('name="robots" content="noindex, nofollow"');
  expect(app).not.toContain("application/ld+json");
});
```

- [ ] **Step 2: Run the SEO test to verify it fails before sitemap integration.**

Run: `npm run build && npx vitest run src/pages/__tests__/acquisitionSeo.test.ts`

Expected: FAIL because the current sitemap filter does not exclude `/app` or callbacks and the new landing metadata/schema is not yet complete.

- [ ] **Step 3: Update sitemap filtering and route metadata without changing existing public intent.**

Normalize sitemap pathnames before comparison, exclude `/app`, `/app/auth/callback`, `/auth/callback`, private account paths, and the current existing private exclusions, and leave public landing paths included. Keep `public/robots.txt` allowing crawlers to observe noindex. Use absolute self canonicals, nine alternate links including x-default, and the existing no-trailing-slash route convention for non-home paths. Verify every landing FAQ is visible in the page body before emitting FAQPage.

- [ ] **Step 4: Validate the built output and responsive performance gate.**

Run: `npm run build && npx vitest run src/pages/__tests__/acquisitionSeo.test.ts src/pages/__tests__/mobileListingGenerator.test.ts src/pages/__tests__/acquisitionLinks.test.ts && npm run verify:production`

Expected: PASS. The built HTML contains initial localized content, schema isolation, canonical and alternates, matching sample disclosure, and no private sitemap entries. Run `npm run preview -- --host 0.0.0.0` for the release owner to measure representative mobile and desktop Web Vitals; approve only p75 LCP at or below 2.5 seconds, CLS at or below 0.1, content parity, and no generation request before CTA readiness.

- [ ] **Step 5: Run post-build release checks without deployment.**

Inspect representative English and localized URLs with the configured browser at mobile and desktop widths, validate JSON-LD with the chosen structured-data validator, verify internal links and one-filled-primary behavior, and record the result in the existing growth QA record. After an explicitly approved production release, run Search Console URL Inspection and structured-data checks for the English and one localized route. These checks measure discoverability and correctness; they do not assert rankings or traffic.

- [ ] **Step 6: Commit only acquisition SEO files.**

```bash
git add astro.config.mjs src/components/MobileListingGeneratorLanding.astro src/pages/app/index.astro src/pages/app/auth/callback.astro src/pages/__tests__/acquisitionSeo.test.ts
git commit -m "feat: finalize mobile acquisition SEO boundaries"
```

## Release and rollback boundary

The implementation order is Task 1, Task 2, Task 3, Task 4, then Task 5. The app feature flag, backend server contracts, and app-client device gates are prerequisites. Preview must pass `npm run verify:production`, built-output SEO checks, approved-sample privacy checks, responsive performance budgets, and real iPhone Safari and Android Chrome checks before the public pages or filled app CTA are exposed. Production rollout is a separate approved release action. If a gate fails, disable the mobile app flag and route-aware app CTA, retain existing extension CTAs and public pages, and remove only the new public landing routes from the sitemap through a reviewed revert. Do not delete the idempotency migration, alter subscriptions, reset quotas, or change extension callbacks during rollback.

## Non-goals carried into implementation

This plan does not add seller-note sync, history, batch generation, offline storage, a service worker, IndexedDB, a share target, native Vinted handoff, anonymous generation, guest quota, visitor uploads, public pages for the 18 output languages, a new pricing model, a new Stripe product, or replacement of any existing extension, description, guide, ChatGPT, or Orion page.
