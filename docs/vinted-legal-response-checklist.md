# Vinted legal response checklist

Started: 7 August 2026  
Response deadline in NLO letter: 11 August 2026

## Immediate containment

- [x] Preserve both NLO emails, headers, attachments, and evidence screenshots.
- [x] Confirm the current extension uses `https://autolister.app` for API, auth, phone upload, welcome, update, and uninstall routes.
- [x] Confirm `quick-vint.vercel.app` is a separate legacy Vercel project, not the `autolister.app` production project.
- [x] Take `quick-vint.vercel.app` offline and verify `autolister.app` remains healthy. Alias detached 7 August 2026; old hostname returns 404 while the homepage, pricing, phone upload, and auth callback return 200.
  - Impact note: extension 1.3.9 migrated to `autolister.app` on 13 May 2026. Current version 1.4.3 is fully migrated; only obsolete 1.3.8-or-older installations still point at the retired hostname.
- [x] Remove Vinted logos and copied Vinted imagery from public marketing. Static imagery cleaned 7 August 2026; the moving demo video remains assigned to the user for a motion-aware crop.
- [ ] Remove claims including “ToS compliant”, “zero ban risk”, “account safe”, “invisible to bot detection”, and “wallet protected”.
- [ ] Remove the DotB/Vintex comparison and unsupported competitor-risk claims.
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
