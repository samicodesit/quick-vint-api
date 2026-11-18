# Explicit code verification, November 17, 2026

Status: local draft, not deployed. Supersedes the automatic-only code submission described in the earlier direct-first-item QA record.

## Result

- The same labeled text input supports the numeric keyboard and one-time-code autocomplete. Digits use a compact 224px field, 28px tabular type and extra spacing. It remains one real input for keyboard and assistive technology.
- Verify code and Enter submit the same form handler. Typing or autofilling six digits never submits automatically. Empty and partial codes show a field error without an API request or URL navigation.
- Whole-code clipboard paste accepts spaces and preserves leading zeroes. Removing the HTML six-character cap avoids truncating formatted clipboard content before normalization.
- Verification preserves input focus and makes the input read-only while pending. Verify, resend and change-email controls cannot submit competing operations. The live checking/error region remains outside the busy button so its announcements are not deferred by a busy ancestor.
- Invalid codes are identified with an associated inline error and aria-invalid. Service failures preserve the code and show a retry message without labeling the code invalid. Retrying does not require editing the field.
- Existing email-link and Google paths, resend/change-email controls, saved preferences, first-item entry and optional model setup remain in use.

## Checks

- The new browser regression first failed on the previous version because the Verify code action did not exist.
- The revised built-app browser journey passes: click and Enter, keyboard traversal, empty/partial/invalid code, real clipboard paste of `012 345`, leading zero, simulated browser autofill input, service failure, same-code retry, delayed response, duplicate-submit guard, resend/change email and onward draft generation/restoration.
- The first-use/legacy browser suite also checks the code screen for 18 interface languages at 320, 390, 768 and 1440px. It checks overflow, visible verification action, readable digits and translated labels.
- Full repository production verification passed: lint, type checking, build, formatting and 1,804 tests, including the enabled first-use and legacy-style browser suites. Five unrelated opt-in tests were skipped. Browser auth, emails, generation and billing responses are isolated fixtures. No production deployment, paid provider call, real account, email or payment is part of this QA. Actual device/OS email-code suggestions are not claimed from a simulated autofill event.

Actual screenshots are retained here: before-code-_ shows the previous code screen; code-filled-_ shows the new field and Verify code action; code-error-mobile and code-checking-mobile show recovery/loading states.

Standards consulted: [W3C accessible authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum), [W3C predictable input](https://www.w3.org/WAI/WCAG22/Understanding/on-input.html), [GOV.UK codes and sequences](https://design-system.service.gov.uk/components/text-input/#codes-and-sequences). This is a focused implementation review, not a complete accessibility certification.
