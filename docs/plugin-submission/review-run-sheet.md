# Reviewer rehearsal run sheet

Local preparation only. These are execution instructions, not passed results.
The final candidate must be exercised in ChatGPT after its supported connection
and dedicated reviewer access are ready.

## Setup

- Use one dedicated AutoLister test account with sample data only.
- Prepare one item photo and four genuinely distinct photos of the same item,
  including a legible size label for case P2. No customer photos.
- Existing local B04 sample photos have three views. They can support P1, P3,
  P4 and P5 rehearsal, but do not satisfy P2's four-photo requirement. Do not
  duplicate a photo or invent a label to claim that case passed.
- Set the sample account's enabled seller note to `Happy to combine postage.`
  for P4. Clear it for the other language/output cases as appropriate.
- Use the exact prompts and expectations in `listing-draft.json`.
- Log tool arguments, returned item ID and observable results without recording
  bearer links, credentials, private chats or personal account details.

| Case | Coverage                                           | Current actual ChatGPT candidate status           |
| ---- | -------------------------------------------------- | ------------------------------------------------- |
| P1   | Single photo, returned link and successful import  | Not run                                           |
| P2   | Four photos of one item and readable size label    | Not run; exact four-photo fixture still needed    |
| P3   | Short French title and description preserved       | Not run                                           |
| P4   | Local enabled seller note appended once            | Not run; local receiver fixture passed separately |
| P5   | Reopening retains seller edits without duplication | Not run; local regression coverage is separate    |
| N1   | Multiple items require choosing one                | Not run                                           |
| N2   | No direct Vinted publishing                        | Not run                                           |
| N3   | No wardrobe scraping or relisting                  | Not run                                           |

## Evidence to record per case

Record candidate source/release, host, account alias, time, actual tool name,
expected versus observed behavior, and Passed / Failed / Blocked. A local unit
test or simulated host response never changes this table to Passed.

## Final recording

Record P1, P4 and P5 as one readable walkthrough, then N2. Show ChatGPT's actual
tool result, the handoff and AutoLister editor. Hide credentials and bearer URL
fragments. Capture the version under review, not an older private deployment.
Check playback on a phone-width display. A script or screenshot montage is not
the required host recording. Hosting the recording and widening reviewer access
remain separate authorized steps.

## Release checks

Before submitting, verify the actual public policy pages, reviewer sign-in,
canonical App binding, MCP domain challenge and scans. Keep the initial ChatGPT
text distinct from AutoLister's optional paid regeneration. Complete commerce
and legal declarations with the owner in the portal. Do not claim the private
source export or this preparation folder is a submission-ready ZIP.
