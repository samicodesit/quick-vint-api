# Vinted legal response checklist

Started: 7 August 2026  
Response deadline in NLO letter: 11 August 2026

## Incident record

- NLO sent an authenticated cease-and-desist notice on behalf of Vinted on
  7 August 2026. Matter references: `B62060119WW` and `B62060120WW`.
- The notice and its follow-up concern both `autolister.app` and the legacy
  `quick-vint.vercel.app` deployment. Reply on the most recent follow-up thread
  so both references and all NLO recipients remain together.
- The requested response deadline is Tuesday 11 August 2026, after receipt on
  Friday 7 August. A short holding reply requesting an extension through
  21 August 2026 was prepared. Do not mark it sent without checking the actual
  sent thread.
- Do not send the internal legal/technical report, source details, logs, or
  attachments with the holding reply. The holding reply only acknowledges
  receipt, requests time, and states that precautionary steps are not an
  admission of liability.

### Approved holding reply

> Dear Mr Buijs,
>
> Thank you for your correspondence regarding autolister.app and
> quick-vint.vercel.app.
>
> I am taking Vinted’s concerns seriously and have begun carefully reviewing
> the matter and taking precautionary steps while that review continues. As an
> independent developer, I want to ensure that I fully understand the concerns
> and respond properly.
>
> Because the notice was received on Friday with a response requested by
> Tuesday, would you please agree to extend the deadline until 21 August 2026?
>
> I hope we can address this constructively and reach an amicable resolution.
> Thank you for your understanding.
>
> This request and the precautionary steps taken are made without admission of
> liability.
>
> Kind regards,
>
> Sami
>
> AutoLister AI

### Mail-thread notes for future agents

- The original AutoLister recipient was `hello@autolister.app`. Match that
  address in the From header for a reply. If a reply was already sent from
  `support@autolister.app`, do not send a duplicate merely to change the From
  address.
- Address the reply to Timo Buijs and retain Peter Simonis and Daniëlle van
  Weezel in CC. Copying `hello@autolister.app` is optional and only sends
  AutoLister another copy.
- Gmail's yellow “You were BCC'd on this message” banner describes the original
  received message. It persists after the current BCC field is cleared, does
  not mean the new reply contains a hidden BCC recipient, and is not included
  in the outgoing message.
- A prior manual forward to a private recipient does not add that recipient to
  a later reply. Verify the visible To, CC, and BCC fields before sending.
- Agents must follow `AGENTS.md`: Gmail is read-only for AutoLister work. Any
  agent-sent response must use the Resend support flow, the original RFC
  `Message-ID`, a dry run, and the original inbound AutoLister address.

### Chrome Web Store state

- A no-cache public check on 7 August confirmed that version 1.4.3 was live.
- Version 1.4.4 was uploaded successfully through the service-account workflow
  and submitted for review on 7 August. Google returned `PENDING_REVIEW`.
- The 1.4.4 package contains neutral names and summaries in all eight locales.
  All eight detailed descriptions are neutralised in `store-descriptions/`.
- Chrome Web Store's service-account API cannot update dashboard-only detailed
  descriptions. Those must be pasted into each locale in the Developer
  Dashboard. Do not claim the public description changed until the public page
  itself has been checked after review.
- Release workflow evidence:
  <https://github.com/samicodesit/quick-vint-frontend/actions/runs/31183886690>

## Immediate containment

- [x] Preserve both NLO emails, headers, attachments, and evidence screenshots.
- [x] Confirm the current extension uses `https://autolister.app` for API, auth, phone upload, welcome, update, and uninstall routes.
- [x] Confirm `quick-vint.vercel.app` is a separate legacy Vercel project, not the `autolister.app` production project.
- [x] Take `quick-vint.vercel.app` offline and verify `autolister.app` remains healthy. Alias detached 7 August 2026; old hostname returns 404 while the homepage, pricing, phone upload, and auth callback return 200.
  - Impact note: extension 1.3.9 migrated to `autolister.app` on 13 May 2026. Current version 1.4.3 is fully migrated; only obsolete 1.3.8-or-older installations still point at the retired hostname.
- [x] Remove Vinted logos and copied Vinted imagery from public marketing. Static imagery cleaned 7 August 2026; the moving demo video remains assigned to the user for a motion-aware crop.
- [x] Remove claims including “ToS compliant”, “zero ban risk”, “account safe”, “invisible to bot detection”, and “wallet protected”.
- [x] Remove the DotB/Vintex comparison and unsupported competitor-risk claims.
- [ ] Review and temporarily disable the highest-risk extraction/automation features pending legal advice.

## Legal operator and advice

- [ ] Identify the exact operator: legal name, entity type, registration number, registered address, and owner/director.
- [ ] Confirm the legal identity used by Stripe, the Chrome Web Store, Vercel, domain registration, invoices, and customer contracts.
- [ ] Reconcile the operator with AutoLister’s current Netherlands-law/Amsterdam-arbitration terms.
- [ ] Retain an EU trademark and software/platform lawyer in the correct jurisdiction.
- [ ] Give counsel the NLO correspondence, trademark PDFs, screenshots, product flow, terms, company documents, and mitigation record.
- [ ] Send a non-admission holding response through counsel before the deadline and request an extension if needed.

## Proposed resolution

- [ ] Ask NLO to identify the exact functionality and uses they require AutoLister to stop.
- [ ] Seek agreement for one neutral compatibility reference, if counsel recommends it.
- [ ] Offer narrowly defined undertakings on logos, marketing claims, scraping, and automation without admitting infringement.
- [ ] Update public legal documents and company disclosures after counsel confirms the correct operator and governing terms.
