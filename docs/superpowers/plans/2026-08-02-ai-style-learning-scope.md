# AI Style Learning Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict AI style learning to new-listing pages and clarify that factual corrections are ignored without suppressing other learnable changes in the same edit snapshot.

**Architecture:** Add one pure page-eligibility helper used at the start of the existing learner path, before database work. Refine only the existing `gpt-5.4-mini` system prompt; keep the full edit examples and all tier/cooldown behavior unchanged.

**Tech Stack:** TypeScript, Vercel functions, Vitest, OpenAI chat completions.

## Global Constraints

- Continue logging edit events from `/edit`; only learner execution is skipped.
- Do not add dependencies, schema changes, extension changes, or deterministic fact parsers.
- A factual correction suppresses only that evidence, not independent presentation changes in the same snapshot.
- Learning must not generalize beyond the observed edited dimension.

---

### Task 1: New-listing learner gate

**Files:**

- Modify: `utils/aiStyleLearning.ts`
- Modify: `api/events/track.ts`
- Test: `src/utils/__tests__/aiStyleLearning.test.ts`

**Interfaces:**

- Produces: `isAiStyleLearningPage(page: unknown): boolean`
- Consumes: the normalized event item's root `page` value.

- [ ] **Step 1: Write failing tests**

Add cases accepting absolute and relative `/items/new` paths with an optional trailing slash, and rejecting `/items/123/edit`, unrelated, missing, and malformed values.

- [ ] **Step 2: Verify the tests fail**

Run `npm test -- src/utils/__tests__/aiStyleLearning.test.ts` and confirm the helper is missing.

- [ ] **Step 3: Implement the minimum gate**

Parse absolute URLs with `URL`; normalize relative values against a fixed base; compare the pathname to `/items/new` after removing a trailing slash. Call the helper immediately after confirming the event name, before reading its context or profile.

- [ ] **Step 4: Verify focused tests pass**

Run `npm test -- src/utils/__tests__/aiStyleLearning.test.ts`.

### Task 2: Tighten learner judgment

**Files:**

- Modify: `utils/aiStyleLearner.ts`
- Create: `src/utils/__tests__/aiStyleLearner.test.ts`

**Interfaces:**

- Keeps: `suggestAiStyle({ currentInstructions, examples })`
- Changes: only its system instruction text.

- [ ] **Step 1: Write a failing prompt-contract test**

Mock the OpenAI completion and assert its system message says factual substitutions are ignored as evidence rather than forcing the whole result to `no_change`, allows independent presentation changes in the same snapshot, recognizes cross-field retention as possible field-placement evidence, and forbids broadening beyond the observed dimension.

- [ ] **Step 2: Verify the test fails**

Run `npm test -- src/utils/__tests__/aiStyleLearner.test.ts`.

- [ ] **Step 3: Refine the existing prompt**

Replace the broad size-correction sentence with the approved evidence rules while keeping the JSON contract, conservative threshold, varied-item warning, factual safeguards, complete-instruction requirement, and 1000-character limit.

- [ ] **Step 4: Verify focused tests pass**

Run `npm test -- src/utils/__tests__/aiStyleLearner.test.ts src/utils/__tests__/aiStyleLearning.test.ts`.

### Task 3: Verify, deploy, and production-probe

**Files:**

- No additional runtime files.

**Interfaces:**

- Production endpoint remains `POST /api/events/track`.

- [ ] **Step 1: Run production verification**

Run `npm run verify:production` and confirm all checks pass.

- [ ] **Step 2: Commit and deploy through main**

Commit the approved files, then run `npm run push:production`; require output containing `main -> main`.

- [ ] **Step 3: Repeat the API probes**

On the dedicated test account, clear its current test style, submit a size-substitution `/items/new` edit and require `no_change`, then submit an independent size-removal edit and verify any learned instruction is limited to size placement. Submit an `/items/:id/edit` event and verify it creates the normal edit log but no learner log.

- [ ] **Step 4: Report exact evidence**

Report learner outcomes, retained instruction, endpoint timings, log IDs, deployment push proof, and any remaining model variability.
