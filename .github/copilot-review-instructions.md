# Copilot Code Review Instructions

## Review Philosophy

Focus on **correctness, security, and functionality**. Do not nitpick style, naming conventions, or minor documentation wording.

## Do NOT comment on

- Minor documentation phrasing or wording choices
- Hypothetical edge cases that are not realistically triggered in this project
- Suggesting abstractions or refactors that aren't necessary for correctness
- Code style preferences (formatting, variable naming, comment wording)
- Unused imports or variables that are clearly part of a module's public API (e.g., `module.exports`)
- Suggesting changes to code that is not part of the current PR diff
- "Consider doing X" suggestions that are purely preference-based

## DO comment on

- Security vulnerabilities (XSS, injection, auth bypass, secret exposure)
- Bugs or logic errors that would cause incorrect behavior
- Missing error handling that would cause crashes in production
- Breaking API contract changes between frontend and backend
- Race conditions or data loss scenarios
