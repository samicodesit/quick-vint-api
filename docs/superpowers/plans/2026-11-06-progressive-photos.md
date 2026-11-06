# Show validated photos as they finish

Local changes only. No deployment or paid provider calls.

1. Expose independently accepted slots from owned, unexpired jobs. Never expose rejected candidates.
2. Attach each accepted slot independently in the browser. Persist received slots so retries, reopening, concurrent tabs and seller deletions cannot duplicate or resurrect photos. Preserve source and account fences.
3. Show one remaining placeholder after the first arrival, using existing status copy.
4. Verify partial failure/retry, arrival order, deletion, ownership revocation and legacy full-pair behavior with targeted tests, then run the full production gate.
5. Render desktop and mobile examples using existing images and mocked local endpoints. Report measured delivery behavior without claiming faster provider inference.
