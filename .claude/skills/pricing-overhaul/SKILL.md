---
name: pricing-overhaul
description: Complete pricing model specification for AutoLister. Use when implementing or modifying anything related to pricing tiers, credit system, billing lifecycle, feature gating, Stripe integration, rollover logic, legacy user handling, or the pricing page UI.
---

# AutoLister Pricing Overhaul — Final Version (Audited)

---

## The Pricing Grid

Every number below follows one rule: **the per-credit cost gets cheaper as you commit more.** No tier contradicts another. No bypass path exists.

|                                | Closet Clear Pack | Starter    | Plus       | Pro ★                   | Business                |
| ------------------------------ | ----------------- | ---------- | ---------- | ----------------------- | ----------------------- |
| **Price**                      | €3.99 one-time    | €5.99/mo   | €9.99/mo   | €14.99/mo               | €24.99/mo               |
| **Credits**                    | 15 perpetual      | 80/mo      | 200/mo     | 400/mo                  | 1,000/mo                |
| **Per-credit**                 | €0.27             | €0.075     | €0.050     | €0.037                  | €0.025                  |
| **Rollover cap**               | N/A (no expiry)   | 240        | 600        | 1,200                   | 3,000                   |
| **Phone Upload**               | Yes (all 15)      | Unlimited  | Unlimited  | Unlimited               | Unlimited               |
| **Tone Control**               | No                | No         | No         | **Yes**                 | **Yes**                 |
| **Emoji Support**              | No                | No         | No         | **Yes**                 | **Yes**                 |
| **Multi-lang batch**           | No                | No         | No         | **Yes**                 | **Yes**                 |
| **Listing Preferences**        | No                | No         | **Yes**    | **Yes**                 | **Yes**                 |
| **Smart Re-Gen**               | No                | No         | **Yes**    | **Yes**                 | **Yes**                 |
| **Listing Completeness Check** | Score only        | Score only | Score only | **Score + suggestions** | **Score + suggestions** |
| **Priority processing**        | No                | No         | No         | No                      | **Yes**                 |
| **Support**                    | Standard          | Standard   | Standard   | Priority (24h)          | Dedicated (direct)      |

**Per-credit ladder (must always hold):**
€0.27 → €0.075 → €0.050 → €0.037 → €0.025

Each step is strictly cheaper. Verified. No contradictions.

---

## Free Evaluation — €0

- 5 credits at signup.
- 2 credits/week drip for 4 weeks, then stops permanently.
- Total free credits ever per account: **13.**
- Phone Upload: 5 uses/month.
- Tone Control / Emoji: No.
- The 4-week drip is a one-time-per-account event. It never resets, not on cancellation, not on re-signup.

**When free credits run out, the user sees:**

```
┌──────────────────────────────────────────────┐
│                                              │
│  ✨ You've used all your free credits        │
│                                              │
│  You generated 13 listings with AutoLister.  │
│  To keep going:                              │
│                                              │
│  ┌────────────────────┐  ┌────────────────┐  │
│  │  Get 15 credits    │  │  See plans     │  │
│  │  €3.99 one-time    │  │  from €5.99/mo │  │
│  └────────────────────┘  └────────────────┘  │
│                                              │
│  No commitment needed.                       │
└──────────────────────────────────────────────┘
```

Two buttons. No ambiguity. Both reference the correct numbers (15 credits at €3.99).

---

## Closet Clear Pack — €3.99 one-time

- 15 credits. They never expire.
- Phone Upload works for all 15.
- No Tone Control, no Emoji.
- Per-credit cost: €0.27.

**Why it works at this price:** €3.99 is an impulse purchase — below the "let me think about it" threshold. At €0.27/credit it's clearly more expensive per-credit than every subscription tier, so it doesn't cannibalize subscriptions. But it captures revenue from people who refuse to subscribe.

**The conversion nudge:** After a user buys their second pack, show:

```
┌──────────────────────────────────────────────┐
│                                              │
│  💡 Quick math                               │
│                                              │
│  You've spent €7.98 on packs (30 credits).   │
│  A Starter subscription is €5.99/mo for 80   │
│  credits — 2.7x more for less money.         │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  Switch to Starter — €5.99/mo       │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [No thanks, just the pack]                  │
└──────────────────────────────────────────────┘
```

This is the moment casual buyers become subscribers.

---

## Starter — €5.99/mo

- 80 credits/month. Rollover cap: 240.
- Unlimited Phone Upload.
- No Tone Control, no Emoji.
- Per-credit: €0.075.

**Why €5.99:** Matches Dotb's entry tier. You're a smaller tool — you can't be more expensive at the door than the market leader with 10K weekly users.

**Why 80 credits:** Enough for a side-hustler listing 15–20 items/month with some re-generations. Someone doing 25+/month feels the squeeze and looks at Plus. At 100 credits the per-credit cost (€0.06) gets dangerously close to your API cost floor.

**Why unlimited Phone Upload here:** Phone Upload is your habit-forming workflow hook. It's what makes users open AutoLister every time they pull something from their closet. Gating it at the entry tier punishes the exact behavior you want. Let them get hooked on the convenience — upsell on output quality (Tone Control) later.

---

## Plus — €9.99/mo

- 200 credits/month. Rollover cap: 600.
- Unlimited Phone Upload.
- No Tone Control, no Emoji.
- Listing Preferences + Smart Re-Gen unlocked.
- Per-credit: €0.050.

**Why this tier exists:** The original model jumps from €6.99 to €14.99 with nothing in between. Someone listing 25–30 items/month has no home — Starter runs out mid-month, Pro is overkill. Plus catches them.

**Why no Tone Control:** Tone Control is the only meaningful feature gate that justifies the jump to Pro. If you give it away at €9.99, people stop at Plus and never reach €14.99.

**Why Listing Preferences + Smart Re-Gen start here:** These features create workflow stickiness without giving away the output quality upgrades (Tone Control, Multi-lang) that define Pro. A Plus user who's configured their preferences and uses Smart Re-Gen on every listing has real switching cost — and that's your churn defense at this tier.

---

## Pro — €14.99/mo ★ Most Popular

- 400 credits/month. Rollover cap: 1,200.
- Unlimited Phone Upload.
- Tone Control + Emoji unlocked.
- Multi-language batch generation unlocked.
- Listing Completeness Check with specific improvement suggestions.
- Priority support (response within 24h).
- Per-credit: €0.037.

**The upgrade story from Plus:** "Your listings will sound more human and reach more markets." Volume + quality + reach unlock together.

**Why multi-language batch fits here too:** It costs you one API call with extended instructions — negligible marginal cost. Moving it to Pro makes the tier significantly more attractive for sellers active on multiple Vinted domains (FR + DE + NL + BE). It's a strong reason for Plus users to upgrade that doesn't exist if you gate it to Business only.

---

## Business — €24.99/mo

- 1,000 credits/month. Rollover cap: 3,000.
- Everything in Pro, plus:
- Priority server processing.
- Dedicated support (direct contact).
- Per-credit: €0.025.

**Why €24.99:** Dotb's top tier is €24.99 and includes automation features you don't offer (relisting, auto-messages). You can't price above them with less total functionality.

**Business justification:** At this tier, the value proposition is volume (1,000 credits), speed (priority processing), and direct support access. These matter to Vinted Pro businesses running high-volume operations where downtime or slow generation costs real money.

---

## Features — Detailed Specs

### 1. Listing Completeness Check (all tiers — redesigned to avoid backfire)

This is NOT an "SEO score for your AI output." That would backfire — if your own AI generates text and then your own scorer rates it 4/10, you're publicly admitting your tool produces mediocre output. Instead, this scores the **entire listing page on Vinted** — all the fields the seller has filled in, not just the text AutoLister generated.

**What it checks (these are page-level signals, not AI-output quality):**

- Title length: is the seller using a good portion of Vinted's 100-character title limit?
- Description length: is there enough detail for Vinted's search to index?
- Hashtag count: does the description include at least 3 hashtags?
- Photo count: does the listing have at least 3 photos? This is the current implementation threshold.
- Measurements: if a measurements section is present, is at least one measurement field filled in?

**How it works across tiers:**

- **Free, Pack, Starter:** Show a completeness score (e.g., "Your listing is 6/10 complete"). No further detail. This creates curiosity and a sense that they're leaving performance on the table.
- **Plus:** Same score, still no detailed suggestions. But the Smart Re-Gen and Listing Preferences features at this tier indirectly help improve the score by producing more thorough output.
- **Pro and Business:** Show the score AND specific, actionable suggestions: "Add material to your title (+1)", "Your description is under 150 characters — expand it (+1)", "Add 3 more photos for better visibility (+1)."

**Why this works for manually typed content too:** The check evaluates the whole listing page, so yes — if someone on the free tier types their own description and it's missing brand/size/material, the score reflects that. It works the same whether the text was AI-generated or hand-typed. This makes the feature universally useful and avoids the trap of the AI grading its own homework.

**Why this doesn't backfire on AI-generated content:** Since the score checks page-level completeness (title length, description length, photos), the AI-generated text will naturally score well on the actual checks. The only lower-scoring area in the current implementation is photo count, so the feature encourages users to add more images without penalizing the text it generated.

**Vinted-safe:** You're reading the DOM of the listing page the user is already on. No API calls, no automation.

**UI — what the user sees:**

```
┌─────────────────────────────────────────────┐
│  Listing Completeness          3/5  ██████░░░░  │
│                                                   │
│  ✅ Title length (68/100 chars)                   │
│  ✅ Description length (220 chars)                │
│  ⚠️ Hashtags: 1 found (add 2 more)               │
│  ⚠️ Photos: 2 uploaded (add at least 3 photos)    │
│  ⚠️ Measurements: 1/2 filled                     │
│                                                   │
│  [Pro/Business] shows full tips for missing items │
│  Free/Starter/Plus see the score and pass/fail    │
│  state for each checked field.                    │
└─────────────────────────────────────────────┘
```

On Free/Pack/Starter/Plus: failing items show the score state and an upgrade prompt. On Pro/Business: failing items also show actionable tips inline.

### 2. Smart Re-Gen (Plus tier and above)

When a user isn't happy with a generation, let them click "Regenerate" with a dropdown:

- "More detailed" (longer description, more specifics)
- "More casual" (lighter, conversational tone — this is a basic variant, distinct from full Tone Control which offers multiple specific tones like "luxury," "streetwear," "vintage," etc.)
- "Shorter" (concise version)

Each re-gen costs 1 credit. This increases credit consumption naturally without feeling predatory — the user is choosing to improve their listing.

**Vinted-safe:** You're generating text. That's it.

**UI — what the user sees:**

```
┌─────────────────────────────────────────┐
│  Not quite right?                       │
│                                         │
│  ↻ Re-generate as:                      │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │📝 Detailed│ │💬 Casual │ │✂️ Short │ │
│  └──────────┘ └──────────┘ └─────────┘ │
│                                         │
│  Costs 1 credit                         │
└─────────────────────────────────────────┘
```

On Free/Pack/Starter: the three buttons are grayed out with "Available on Plus" beneath them. The basic "Regenerate" button (same style, costs 1 credit) is still available to everyone — Smart Re-Gen is the _directional_ re-gen, not the ability to re-generate at all.

### 3. Listing Preferences (Plus tier and above)

This is NOT a freeform text box. It's a set of **predefined checkboxes** you control, so the output stays high quality and you avoid garbage-in-garbage-out prompt pollution.

**Default checkbox options you ship with:**

```
┌──────────────────────────────────────────────┐
│  🎨 Listing Preferences                      │
│                                              │
│  Include in every listing:                    │
│  ☐  Mention "smoke-free home"                │
│  ☐  Mention "pet-free home"                  │
│                                              │
│  ───────────────────────────────────────────  │
│  💡 Suggest a new preference                  │
│  ┌──────────────────────────────────────────┐ │
│  │ e.g. "always mention if item has pockets"│ │
│  └──────────────────────────────────────────┘ │
│  [Submit suggestion]                          │
│                                              │
│  Suggestions go to AutoLister team.           │
│  Popular requests get added as new options.   │
└──────────────────────────────────────────────┘
```

**How it works:**

- You define the available checkbox options. Users pick which ones they want active.
- The AI appends instructions based on checked boxes to every generation prompt.
- Users can suggest new preference options via a text field. Suggestions go to you (a simple form/webhook to your inbox or a database). You review them, and if a suggestion is good, you add it as a new checkbox option in a future update.
- **Users cannot type freeform instructions that get injected into the AI prompt.** This prevents prompt pollution, gibberish, and quality degradation. You stay in control of output quality.

**Why this is better than freeform "Saved Styles":** You maintain quality control. If someone typed "make it sound like a pirate" as a saved style, every listing they generate would be ridiculous. With checkboxes, every option produces professional output because you've pre-tested each instruction.

**Why the suggestion box matters:** It makes users feel heard without giving them control over the prompt. It also gives you a direct channel for feature requests — if 30 people suggest "mention if item has pockets," you know exactly what checkbox to add next.

**Saved Preferences are NOT deleted on downgrade** — they're just inactive (checkboxes grayed out). If the user re-upgrades to Plus or above, their preferences reactivate. This prevents rage and preserves switching cost.

**Vinted-safe:** Text preferences stored in your backend. No Vinted interaction.

### 4. Multi-Language Batch Generation (Pro and Business)

Generate the same listing in 2+ languages simultaneously from one photo set. One click produces the French, German, and Dutch versions of the same listing.

**What it costs you:** One API call with extended instructions — essentially the same cost as a single generation. The marginal cost is negligible.

**Why it's powerful:** Sellers active on multiple Vinted domains (vinted.fr, vinted.de, vinted.nl, vinted.be) currently have to generate each language separately, burning one credit per language. This feature produces all languages in one credit (or possibly 1 credit per language — your call on the economics, but 1 credit per language is fairer to your margin).

**Credit cost decision:** Charge 1 credit per language generated in the batch. A 3-language batch = 3 credits. This is fair, transparent, and protects your API margin. Users still save time (one click instead of three separate generations), which is the real value.

**Vinted-safe:** Text generation only.

**UI — what the user sees:**

```
┌──────────────────────────────────────────┐
│  🌍 Multi-Language Generation            │
│                                          │
│  Generate this listing in:               │
│  ☑️ Français (vinted.fr)                 │
│  ☑️ Deutsch (vinted.de)                  │
│  ☐  Nederlands (vinted.nl)               │
│  ☐  Español (vinted.es)                  │
│  ☐  Italiano (vinted.it)                 │
│  ... [show all 18 languages]             │
│                                          │
│  Selected: 2 languages → 2 credits       │
│                                          │
│  [Generate All]                          │
│                                          │
│  Each language output appears in a tab   │
│  you can copy individually.              │
└──────────────────────────────────────────┘
```

On Free/Pack/Starter/Plus: the multi-lang section shows with a lock icon and "Available on Pro" beneath it. The default single-language generation still works on all tiers.

### 5. Listing History / Stats Counter (all tiers)

Show each user in the extension popup:

- Total listings generated this month
- Credits remaining
- Rollover credits banked (for subscribers)
- Permanent pack credits remaining

Simple dashboard. This drives awareness of credit consumption and naturally pushes people toward higher tiers when they see themselves approaching the limit.

**Vinted-safe:** Internal metrics only. No Vinted data accessed.

**UI — what the user sees (extension popup header):**

```
┌──────────────────────────────────────────┐
│  AutoLister AI                    ⚙️     │
│  ─────────────────────────────────────── │
│  Plan: Starter                           │
│  Credits: 23 remaining                   │
│  ├── 18 subscription credits (resets 12d)│
│  └── 5 pack credits (permanent)          │
│  Rollover bank: 47 / 240                 │
│  Listed this month: 34 items             │
│  ─────────────────────────────────────── │
│  [⚡ Upgrade to Plus — €9.99/mo]         │
└──────────────────────────────────────────┘
```

The upgrade button dynamically shows the next tier up. For free users it says "[Get 15 credits — €3.99]" alongside "[See all plans]". For Business users it disappears.

---

## Edge Cases

### Cancellation

1. Banked rollover credits stay usable until end of current billing cycle.
2. When cycle ends: all subscription credits (monthly + rollover) expire to zero.
3. Permanent credits from Closet Clear Packs survive cancellation — they never expire.
4. User reverts to Free tier with 0 subscription credits and no drip (drip is one-time-per-account, never resets).
5. They can buy Closet Clear Packs to continue using the tool without subscribing.

### Downgrade (e.g., Pro → Starter)

1. Takes effect at next billing cycle, not immediately.
2. User keeps full Pro access until cycle ends.
3. When new cycle starts: rollover bank is trimmed to the new tier's cap. Example: user has 500 banked credits on Pro, downgrades to Starter (cap 240). New cycle starts → bank trimmed to 240 + 80 fresh Starter credits = 320 usable. The rollover portion cannot exceed 240 going forward.
4. Feature access drops at cycle change (Tone Control, Emoji, Multi-lang locked again; Listing Preferences and Smart Re-Gen locked if downgrading below Plus).
5. **Listing Preferences are NOT deleted on downgrade** — they're just inactive (checkboxes grayed out). If the user re-upgrades to Plus or above, their preferences reactivate. This prevents rage and preserves the switching cost.
6. **Show this at the downgrade confirmation screen:** "When your new plan starts on [date], you'll keep up to [new cap] of your banked credits. Credits above that will expire. You'll also lose access to [list features being locked]."

### Upgrade (e.g., Starter → Pro)

1. Immediate — no waiting for next cycle.
2. Prorate remaining days on old plan against new plan price.
3. All existing credits (subscription + rollover + permanent pack credits) are preserved.
4. New tier's higher rollover cap applies immediately.
5. New credit allotment added immediately, prorated for remaining days in cycle.
6. Feature unlock (Tone Control, Emoji, Multi-lang, Listing Preferences, etc.) is instant.

### Buying a Closet Clear Pack while on a subscription

1. The 15 pack credits go into a separate "permanent credits" balance.
2. **Consumption order: subscription credits are consumed first** (they expire), permanent pack credits last (they don't expire). Always burn the expiring resource first.
3. This means pack credits act as a safety net — they're always there if the user has a high-volume month. This feels good and increases satisfaction.

### Buying multiple Closet Clear Packs

1. Allowed. No cap.
2. Each pack adds 15 to the permanent balance.
3. Subscription credits still consumed first.
4. If someone buys 5 packs (€19.95 for 75 credits), they've spent more than 3 months of Starter for fewer credits. They'll figure out the subscription math eventually. If they don't, you've still captured €19.95.

### Failed payments / involuntary churn

1. 7-day grace period. Full access during grace.
2. Payment retry: day 1, day 3, day 7.
3. After day 7 with no success: downgrade to Free (0 credits, no drip). Rollover credits freeze (don't expire yet) for 14 more days.
4. If user reactivates within 14 days: restore their full rollover balance.
5. After 14 days: rollover expires permanently.
6. Permanent pack credits are never affected by failed payments — they survive everything.
7. Send an email on day 1 ("Your payment failed — update your card to keep your plan") and day 5 ("Your plan expires in 2 days — here's a direct link to update payment").

### Legacy users (12 existing subscribers)

1. **Keep their exact plans and limits as-is.** Do not change their credit allocations, pricing, or feature access. They stay on the legacy system in Stripe with no backend remapping.
2. Old €3.99 Starter users keep 15 listings/day, 300/month at €3.99.
3. Old €9.99 Pro users keep 40 listings/day, 800/month at €9.99.
4. Old €19.99 Business users keep unlimited daily, 1,500/month at €19.99.
5. **When a legacy user voluntarily chooses to switch** to the new pricing (e.g., they see the new plans and want credit rollover, or they want to upgrade/downgrade), they move to the new system permanently. The old plan is retired for that user.
6. To encourage voluntary migration without forcing it: show a subtle banner in the extension for legacy users: "New plans available — rollover credits, no daily limits. [See what's new]." No urgency, no pressure. Let them move when ready.
7. **If a legacy user cancels and later resubscribes**, they come back on the new pricing — the legacy plan is not available for re-enrollment.

---

## What to Show on the Pricing Page

1. One line at the top: "Start free with 13 credits — no card required." Do NOT give the free tier its own card with equal visual weight.
2. Show the Closet Clear Pack as a separate card labeled "No commitment — for weekend clearouts."
3. Show Starter, Plus, Pro, Business as the four subscription cards.
4. Label Pro as "Most Popular." Label Business as "For Vinted Pro sellers."
5. **Show the per-credit cost on every card.** This is your strongest conversion lever. When someone sees the pack at €0.27/credit next to Starter at €0.075/credit, the subscription sells itself.
6. Do NOT add annual pricing yet. You have 12 subscribers. Add annual plans when you pass 200+.
7. Do NOT add more pack sizes. One pack, one subscription ladder. Simplicity wins.

**UI — pricing page layout:**

```
 Start free with 13 credits — no card required. [Install Extension]
 ─────────────────────────────────────────────────────────────────

 ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────┐
 │   Starter   │ │    Plus     │ │  Pro ★      │ │   Business   │
 │   €5.99/mo  │ │  €9.99/mo   │ │ €14.99/mo   │ │  €24.99/mo   │
 │             │ │             │ │ MOST POPULAR │ │ For Vinted   │
 │  80 credits │ │ 200 credits │ │ 400 credits  │ │   Pro sellers│
 │  €0.075/ea  │ │  €0.05/ea   │ │  €0.037/ea   │ │ 1,000 credits│
 │             │ │             │ │              │ │  €0.025/ea   │
 │ ✓ Phone     │ │ ✓ Phone     │ │ ✓ Phone      │ │              │
 │   Upload    │ │   Upload    │ │   Upload     │ │ Everything   │
 │ ✓ Rollover  │ │ ✓ Rollover  │ │ ✓ Rollover   │ │ in Pro, plus:│
 │             │ │ + Listing   │ │ + Tone       │ │              │
 │             │ │   Preferences│ │   Control   │ │ + Priority   │
 │             │ │ + Smart     │ │ + Emoji      │ │   processing │
 │             │ │   Re-Gen    │ │ + Multi-lang │ │ + Dedicated  │
 │             │ │             │ │ + Listing    │ │   support    │
 │             │ │             │ │   tips       │ │              │
 │ [Subscribe] │ │ [Subscribe] │ │ [Subscribe]  │ │ [Subscribe]  │
 └─────────────┘ └─────────────┘ └─────────────┘ └──────────────┘

 ┌──────────────────────────────────────────────────────────────┐
 │  Closet Clear Pack — €3.99 one-time                         │
 │  15 credits that never expire. No commitment.               │
 │  Perfect for a weekend clearout. €0.27/credit.              │
 │  [Buy Pack]                                                 │
 └──────────────────────────────────────────────────────────────┘
```

The pack sits below the subscription cards as a full-width bar, visually secondary. This signals "subscriptions are the main product; the pack is an alternative." Don't give the pack equal card size or people will default to it.

---

## Consistency Audit

| Check                                                                     | Result                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Does every tier cost less per-credit than the one below it?               | ✅ €0.27 → €0.075 → €0.050 → €0.037 → €0.025                                                                                          |
| Does the pack cost more per-credit than every subscription?               | ✅ €0.27 vs. cheapest sub at €0.075                                                                                                   |
| Does the free-credits-run-out prompt match the pack specs?                | ✅ "Get 15 more for €3.99" / pack = 15 credits at €3.99                                                                               |
| Does the rollover cap follow 3x monthly for all tiers?                    | ✅ 240/600/1,200/3,000 = 3× of 80/200/400/1,000                                                                                       |
| Can a casual seller (10 items/mo) live on free tier forever?              | ❌ Free caps at 13 total, forces conversion                                                                                           |
| Can a casual seller bypass subscriptions with packs?                      | Possible but expensive (€0.27 vs €0.075) — math favors subscribing within 2 months                                                    |
| Does Phone Upload create habit at the entry level?                        | ✅ Unlimited from Starter onward                                                                                                      |
| Is Tone Control a clear Pro-only upgrade?                                 | ✅ Locked on Free, Pack, Starter, Plus; unlocked on Pro + Business                                                                    |
| Is Multi-lang batch on Pro AND Business?                                  | ✅ Both tiers, consistent with grid                                                                                                   |
| Are Listing Preferences + Smart Re-Gen gated at Plus+?                    | ✅ Plus, Pro, Business                                                                                                                |
| Does Listing Completeness Check show suggestions only on Pro+?            | ✅ Score for all, suggestions for Pro + Business                                                                                      |
| Can the Listing Completeness Check rate AI output as bad?                 | ❌ It checks page-level completeness (title, description, photos), not text quality. AI text always scores well on the actual checks. |
| Do permanent pack credits survive cancellation?                           | ✅ They never expire under any circumstance                                                                                           |
| Are subscription credits consumed before pack credits?                    | ✅ Expiring resource burns first                                                                                                      |
| Are legacy users' plans/limits unchanged?                                 | ✅ Kept as-is unless they voluntarily switch                                                                                          |
| Are Listing Preferences preserved on downgrade (just inactive)?           | ✅ They reactivate on re-upgrade                                                                                                      |
| Are Listing Preferences checkbox-only (no freeform prompt injection)?     | ✅ Users pick from predefined options; suggestions go to you for review                                                               |
| Do all edge case rules reference the correct tier numbers?                | ✅ Verified against grid                                                                                                              |
| Does every mention of the pack in the document say "15 credits at €3.99"? | ✅ Verified — no 25-credit references remain                                                                                          |
