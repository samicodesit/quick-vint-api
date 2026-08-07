# Honest Safety Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present AutoLister honestly as an AI listing assistant without absolute safety promises or named-competitor claims.

**Architecture:** Keep the existing localized copy structure and page layout. Remove the standalone comparison section, rewrite the remaining useful workflow copy in every locale, and clean the extension-facing description.

**Tech Stack:** Astro, TypeScript localization objects, Chrome extension localization.

## Global Constraints

- No new dependencies or behavior changes.
- Apply equivalent meaning to English, French, German, Dutch, Polish, Spanish, Italian, and Portuguese.
- Prefer deletion when a claim adds no useful product information.
- Preserve ordinary legal-page uses of “Terms of Service”.

---

### Task 1: Website copy

**Files:**
- Modify: `src/components/HomeLanding.astro`
- Modify: `src/i18n/site.ts`

**Interfaces:**
- Consumes: existing `SiteCopy` and `SiteExtraHomeCopy` localization objects.
- Produces: the same localized homepage and pricing interfaces with factual assistant-led copy.

- [ ] Record the current forbidden-claim and competitor-name search results.
- [ ] Delete the full named-competitor comparison `<section>` from `HomeLanding.astro`.
- [ ] Rewrite visible hero, workflow, feature, and pricing safety copy around three facts: AutoLister prepares drafts, the seller reviews them, and the seller decides when to publish.
- [ ] Apply equivalent natural wording in all eight locale objects.

### Task 2: Extension-facing copy and validation

**Files:**
- Modify: `../quick-vint/_locales/en/messages.json`
- Modify: `../quick-vint/lib/localization.js`
- Modify: `../quick-vint/README.md`
- Modify: `docs/vinted-legal-response-checklist.md`

**Interfaces:**
- Consumes: existing extension description and onboarding feature text.
- Produces: factual assistant wording without account-safety guarantees.

- [ ] Replace “safe”/account-risk marketing language with “AI listing assistant” and seller-controlled workflow language.
- [ ] Verify public source no longer contains `DotB`, `Vintex`, `ToS compliant`, `zero ban risk`, `account-safe`, `invisible to bot detection`, or wallet-safety promises.
- [ ] Run `npm test` and `npm run build` in `quick-vint-api`, then the extension’s existing localization/build checks.
- [ ] Mark the two completed checklist items and commit the website and extension changes.
