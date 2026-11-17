# Direct first-item entry

Owner scope: implement recommendations 1 and 2, with a polished sign-in and preserved SEO. No production deployment or provider spending is authorized by this implementation request.

## Design

Keep the existing AutoLister visual language: paper `#faf9f6`, white `#ffffff`, ink `#252923`, muted `#686b65`, blue `#3458df`, border `#e1e2db`. Geist handles controls; the existing Newsreader display face gives the item example character. Desktop pairs an actual item photo and an explicitly labeled example draft with a focused sign-in form. Mobile puts sign-in first and the complete example below it. The example includes a title, description, four factual bullet points and hashtags. No model-photo promotion or additional setup action appears at entry.

The actual dress image communicates the job better than a generic feature grid or another onboarding wizard. Google and email remain accessible, with explicit labels, keyboard focus and recoverable errors. The code step shows the destination email, one sentence explaining link/code options, one code field, Verify code and resend/change controls. Remove the redundant initial success status and hide the offer/legal links on that step. Per the owner's subsequent correction, Verify code and Enter initiate verification explicitly; typing or autofill does not submit. The code never enters a URL. Avoid redundant helper copy and decorative animation.

## Implementation and acceptance

1. Capture current desktop/mobile entry and sign-in. Add a failing browser check for empty-workspace entry and an unseen model invitation.
2. Remove automatic pre-auth and post-auth style setup. Preserve legacy pending style choices and account defaults. Open Add item only when no saved drafts, imports or restorable view exist.
3. Load model settings silently. No invitation writes, automatic setup or pending-model popup. The manual model button and existing enabled models continue working.
4. Render and refine signed-out, OTP, signed-in first-item and manual model flows. Check 320, 390, 768 and 1440 widths, keyboard, translated copy, failed and successful sign-in, upload and draft generation, reload and saved preferences.
5. Run relevant browser regressions, auth/route/SEO tests and the repository production verification gate. Preserve public landing content, canonical URLs, robots rules and sitemap exclusions. Record evidence and any limits before release approval.

Standards references: [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [WAI form labels](https://www.w3.org/WAI/tutorials/forms/labels/), [WAI form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/).
