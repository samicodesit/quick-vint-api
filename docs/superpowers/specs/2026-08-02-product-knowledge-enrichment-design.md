# Product Knowledge Enrichment Design

## Goal

Enrich listings for confidently recognized non-fashion products with useful facts from the model's existing knowledge, without web search or weakening the default photo-grounding safeguards.

## Design

- Point both existing system-prompt branches to the factual safeguards and knowledge-enrichment scope in the user prompt so higher-priority instructions do not suppress the feature or duplicate its detailed rules.
- Add one concise, three-bullet `Knowledge-based enrichment:` block to the existing generation user prompt, after the general evidence rules and before `Title:`.
- Apply it to confidently recognized books, games, media, electronics, toys, collectibles, appliances, and similar identifiable products.
- Allow recognition from the full image, including covers, packaging, branding, readable text, and distinctive design.
- Include relevant, interesting, seller-useful facts that fit the requested description length; do not impose a fixed fact count.
- Never make a fact more specific than the identity supported by the photos. If recognition or knowledge is uncertain, silently omit knowledge-based facts.
- Exclude ordinary apparel, footwear, bags, jewelry, and fashion accessories.
- Forbid padding, trivia, repetition, promotional claims, and web-search implications.
- Keep the addition near 75 words and state each rule once.

The existing title rules, output schema, request settings, and account-instruction precedence remain unchanged.

## Verification

Update the existing generation prompt tests to assert that both system-prompt branches allow the labeled enrichment block while retaining uncertainty fallback and the fashion exclusion. Run those focused tests.
