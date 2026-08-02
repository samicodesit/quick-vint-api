# AI Style Learning Scope and Judgment Design

## Goal

Limit automatic style learning to newly created listings and reduce drift from factual corrections without suppressing independent presentation preferences contained in the same full edit snapshot.

## Behavior

- Continue logging every `generation_output_edited` event.
- Run the learner only when the event page pathname is `/items/new`, with an optional trailing slash. Skip missing, malformed, and `/items/:id/edit` pages before profile or history queries.
- Keep sending the learner each example's complete generated and final title and description.
- Treat factual substitutions such as one size, brand, material, or condition changing to another as corrections, not preference evidence. This rule applies only to that part of the edit; other independent changes in the same snapshot remain learnable.
- A fact removed from one field but retained unchanged in another can be a reusable field-placement preference. For example, removing size from the title while retaining it in the description can teach “omit size from titles.”
- Learn only the demonstrated dimension. Do not expand removing size into removing other label details.
- Retain model judgment for tone, structure, wording, verbosity, formatting, and field placement. Existing free and paid cooldown behavior remains unchanged.

## Verification

- Unit-test accepted `/items/new` URL forms and rejected edit/malformed/missing pages.
- Test that rejected pages stop before profile access.
- Test that the learner system prompt explicitly separates factual corrections from independent presentation changes and forbids broadening beyond the observed dimension.
- Run the focused backend tests, production verification gate, deploy through `main`, then repeat the correction and omission production API probes on the dedicated test account.

