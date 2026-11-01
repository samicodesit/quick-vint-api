# AI outputs, complaints and refund wording

Status: local release draft, November 1, 2026. No deployment, customer notice, email, refund, dispute submission or payment-setting change. This is source-based drafting, not a legal opinion or a promise that a court or card issuer will accept a particular clause.

## Policy decision

The owner asked for consistent protection against AI text/photo mistakes and left the refund-policy choice to us. Retain the existing policy: no discretionary refund of unused subscription time or partial months, except where statutory rights apply. Do not introduce a blanket no-refunds policy or an AI-error exception to consumer rights. Do not change the existing 14-day EEA/UK withdrawal promise or treat generating a model, using credits or beginning access as a waiver.

Updated public Terms describe AI outputs as reviewable drafts and model photos as synthetic illustrations. They identify plausible errors in text, material, colour, logos, fastenings, wear, anatomy and inferred rear views. Users must check against the actual item and original photos, correct text, remove misleading images and avoid presenting generated images as real fitting photos. There is no promise of exact fit, a particular appearance, uniqueness, sales or a guaranteed estimated processing time.

These disclosures describe the service; they do not excuse non-conformity, erase marketing promises or remove required care and skill. An output a customer dislikes does not by itself establish a full-subscription refund entitlement. A material misrepresentation or failure to supply what was agreed must still be assessed on its facts.

Replaced the blanket as-is/no-damages/no-quality-liability language and consumer indemnity. The existing 12-month-fees cap and indirect-loss exclusion now apply only to actual business customers, subject to mandatory exceptions. A plan called Business does not establish business status. No guaranteed enforceability of the business cap is claimed.

The privacy policy no longer promises automatic forfeiture of all unused payments after an abuse termination. Good-faith complaints, refund requests and payment disputes are expressly not abuse. Support now explains inaccurate outputs and uses the same unused-time/partial-month policy as checkout and the subscription terms.

## Consistency and acceptance boundaries

- Public terms, support and privacy pages were updated together. Existing pricing, checkout disclosure and subscription-confirmation wording were searched for conflicting refund promises.
- The released subscription policy, PDF attachment, checkout wording and automatic email renderer were not rewritten. Their October 28 version and hashes remain unchanged. Existing cancellation and withdrawal processing remain unchanged.
- The current checkout already links to the public Terms and records affirmative recurring acceptance. This update does not create new historical proof of acceptance of the AI clauses. Existing records must not be backfilled or presented as assent to terms that did not exist at purchase.
- Before publication, preserve the previous public terms and the exact final release text and deployment date. Provide the existing-customer material-change notice on a durable medium with the required notice period and effective date; obtain consent where legally necessary. A source date or deployment alone does not satisfy that notice. Existing transactions and accrued rights are not retroactively rewritten.
- A targeted Dutch consumer-law review before publication is advisable, particularly for the business liability cap, how amendments apply to existing customers, and any additional countries actively targeted. No complete international legal compliance audit was performed.
- Public legal/support pages remain in their existing English language. No new untranslated string was inserted into the localized extension or web-app settings.

## Handling an AI-quality complaint

1. Distinguish a request to stop future renewal, a statutory withdrawal, an incorrect charge, a service defect and subjective dissatisfaction. Do not require a consumer to complete a defect investigation before receiving a timely withdrawal statement.
2. Review the actual promises at purchase, accepted version, usage/credit outcome, source images and disputed output where available. An automated quality pass is not proof of accuracy or customer satisfaction. A generation-complete event is not proof that the customer published or accepted a listing.
3. Where correction or repeat performance is the appropriate statutory remedy, supply it free and within a reasonable time without significant inconvenience. Do not force repeated attempts where a serious fault or other legal condition gives an immediate price-reduction or termination right. Do not substitute credits for a legally due refund without valid agreement.
4. Apply the established withdrawal process and refund deadlines. Assess any price reduction or refund against the affected service and period; neither automatically refund the entire subscription for every disliked image nor automatically reject every AI-error claim. Record the reason and decision consistently.
5. Respond to a payment dispute with truthful, relevant records: the terms actually presented, transaction/renewal records, the disputed result if available, reported problem, communications and offered or completed remedy. Do not claim that the current public Terms bind an older purchase, that a logged generation proves conformity, or that missing records prove no complaint occurred. The issuer decides a chargeback; no win rate is promised.
6. Preserve only necessary evidence under the existing privacy/retention rules. Source images ordinarily expire after 24 hours and server listing outputs after 30 days. Missing expired images are not automatic grounds to deny a claim. Do not silently extend product-wide retention for dispute prevention. Existing authorization rules for support sends, refunds and legal holds still apply.

## Sources checked November 1, 2026

- [ACM: digital content and service conformity and remedies](https://consument.acm.nl/garantie-reparatie-geld-terug/garantie-op-digitaal-bestand-of-digitale-dienst).
- [ACM: withdrawal rights, subscriptions and commencement](https://www.acm.nl/nl/verkoop-aan-consumenten/klantenservice/bedenktijd).
- [EU Directive 2019/770](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32019L0770), particularly Articles 14 and 22 on remedies and mandatory rights.
- [Your Europe: unfair contract terms](https://europa.eu/youreurope/citizens/consumers/unfair-treatment/unfair-contract-terms/index_en.htm).
- [Dutch government: general terms, disclosure and amendments](https://business.gov.nl/regulations/general-terms-conditions/).
- [UK Consumer Rights Act, section 57](https://www.legislation.gov.uk/ukpga/2015/15/section/57), limits on excluding service obligations and remedies.
- [Stripe: dispute evidence examples](https://docs.stripe.com/disputes/visual-evidence?locale=en-GB). Processor guidance is evidence-handling guidance, not a substitute for consumer law.

## Verification

Production gate passed: lint, type checks, build, formatting and 1,351 tests; 14 opt-in skips. Local desktop/mobile renders and legal destination/anchor checks passed. Fixed a mobile terms-page overflow caused by the generic container utility plus new margins by using a scoped terms-container class. Screens are in the parent workspace reports/ai-terms-20261101 directory. No additional provider spend was incurred. The extension release ZIP is unchanged.
