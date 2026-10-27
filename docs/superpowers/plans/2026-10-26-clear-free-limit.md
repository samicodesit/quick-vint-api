# Clear free-limit prompts

Scope approved in chat: fix the paused batch Resume paywall, clarify the five-listing lifetime allowance and one-time credit choice, and translate the free-limit prompt. Keep the existing compact layout and replace existing copy. Prepare for user sign-off without pushing or deploying.

1. Add a browser regression that exhausts the allowance while a batch is paused. Resume must open paid options without consuming a generation or changing the saved queue. Verify the test fails before adding the existing generation-blocked callback to Resume.
2. Replace the free-limit heading and sentence on web and extension. Reuse billing translations for the heading, message, checkout controls and existing subscription/credit terms in all 18 supported UI languages. Keep prices, quotas, checkout routes and offer timing unchanged.
3. Run targeted regression tests, both repositories' required local checks, and local browser checks at desktop and narrow widths. Review compact copy, translated controls, plan/credit selection and checkout recovery. Report exact English and French copy and any outstanding checks for sign-off.

Implementation stays inline. Existing unrelated edits remain outside the change.
