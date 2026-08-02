# Product Knowledge Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact prompt exception that enriches confidently recognized non-fashion products with reliable built-in product knowledge, then verify it with automated and live generation checks.

**Architecture:** Point both existing system-prompt branches to the factual safeguards and knowledge-enrichment scope in the user prompt, then add one compact enrichment block to that user prompt in `api/generate.ts`; add no classifier, helper, dependency, or second generation call. Lock both prompt paths with the existing endpoint tests, then exercise the deployed model through the dedicated test account using one known book and one apparel control.

**Tech Stack:** TypeScript, Vitest, OpenAI Chat Completions, Playwright/Chrome extension production flow

## Global Constraints

- Keep the prompt addition to one concise `Knowledge-based enrichment:` subtitle and three bullets.
- Both system-prompt branches must allow the narrowly scoped user-prompt enrichment rule.
- Facts may not be more specific than the product identity supported by the photos.
- Uncertain recognition or knowledge must silently fall back to photo evidence.
- Ordinary apparel, footwear, bags, jewelry, and fashion accessories remain excluded.
- Add no dependencies, helpers, schemas, endpoints, or additional model calls.

---

### Task 1: Prompt Contract

**Files:**

- Modify: `src/api/__tests__/generateRemoteImages.test.ts:254`
- Modify: `api/generate.ts:565`

**Interfaces:**

- Consumes: the existing `userPrompt` string sent to GPT-5.4.
- Produces: the same JSON response contract, with a compact knowledge-enrichment instruction inside that prompt.

- [ ] **Step 1: Write the failing endpoint test**

Rename the default-path test to `allows scoped knowledge enrichment without account instructions`, update its exact system-prompt expectation, and assert this user-prompt block:

```ts
expect(userPrompt).toContain(`Knowledge-based enrichment:
- For confidently recognized books, games, media, electronics, toys, collectibles, appliances, and similar non-fashion products, add substantive, stable, buyer-relevant facts about the specific item from existing knowledge even when not visible in the photos. Generic labels or reputation alone do not count as enrichment.
- Identify from the full image. Never state facts more specific than the identity supported by the photos; omit them when recognition or knowledge is uncertain.
- Avoid padding, trivia, repetition, and promotional claims. Exclude ordinary apparel, footwear, bags, jewelry, and fashion accessories.`);
```

Also assert that the custom-instruction system prompt contains `Follow the factual safeguards and knowledge-enrichment scope in the user prompt; never invent`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/api/__tests__/generateRemoteImages.test.ts -t "preserves the original prompt"
```

Expected: both tests FAIL because neither system-prompt branch allows the enrichment rule yet.

- [ ] **Step 3: Add the minimum prompt block**

Add the narrow enrichment allowance to both `systemPrompt` branches, then insert this block after the final general evidence-rule bullet and before `Title:` in `api/generate.ts`:

```text
Knowledge-based enrichment:
- For confidently recognized books, games, media, electronics, toys, collectibles, appliances, and similar non-fashion products, add substantive, stable, buyer-relevant facts about the specific item from existing knowledge even when not visible in the photos. Generic labels or reputation alone do not count as enrichment.
- Identify from the full image. Never state facts more specific than the identity supported by the photos; omit them when recognition or knowledge is uncertain.
- Avoid padding, trivia, repetition, and promotional claims. Exclude ordinary apparel, footwear, bags, jewelry, and fashion accessories.
```

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npm test -- src/api/__tests__/generateRemoteImages.test.ts
npm run verify:production
```

Expected: both commands pass with no warnings or formatting changes required.

- [ ] **Step 5: Commit**

```bash
git add api/generate.ts src/api/__tests__/generateRemoteImages.test.ts
git commit -m "feat: enrich recognized product listings"
```

### Task 2: Live Model Check

**Files:**

- Read: `scripts/push-production.sh`
- Reuse: `/home/mests/projects/autolister/quick-vint/images/quickvint-upload-single.jpg`
- Create outside repo: `/tmp/pride-and-prejudice-test.png`

**Interfaces:**

- Consumes: the production `/api/generate` endpoint through the existing authenticated Chrome profile and dedicated account `samicodesit+ai-style-test@gmail.com`.
- Produces: two generated descriptions and matching production `log-detail` evidence; no persistent test code.

- [ ] **Step 1: Deploy the verified commit**

Run `npm run push:production` from `quick-vint-api` and require output proving `main -> main`. Wait for the production deployment to become ready before generating.

- [ ] **Step 2: Prepare the recognizable book input**

Use `ffmpeg` to create `/tmp/pride-and-prejudice-test.png`, an 800×1200 neutral book cover containing only `PRIDE AND PREJUDICE` and `JANE AUSTEN`. The image deliberately omits genre, plot, publication date, awards, and other enrichment facts.

- [ ] **Step 3: Generate the book listing**

Using the authenticated persistent Chrome profile configured by `DOM_CANARY_PROFILE_DIR`, open the Vinted create-listing page with the unpacked extension, upload `/tmp/pride-and-prejudice-test.png`, select a long description with hashtags disabled, and click Generate once.

Pass when the description includes at least one accurate, relevant fact not printed on the cover, stays within the identity level of the work, and contains no invented edition-specific claim.

- [ ] **Step 4: Generate the apparel control**

On a fresh Vinted create-listing page, upload `/home/mests/projects/autolister/quick-vint/images/quickvint-upload-single.jpg` and click Generate once with the same settings.

Pass when the description remains based on visible garment details and contains no brand history, product-line claim, or knowledge-based fashion enrichment.

- [ ] **Step 5: Verify production evidence**

Follow `docs/production-log-runbook.md`. Use `log-detail` for both `/api/generate` rows to prove model, prompt, outputs, and image source. Report UTC timestamps, log IDs, generated descriptions, and whether each acceptance criterion passed without exposing tokens or credentials.
