# Project

Requirements overview is a local TypeScript app built with Vite, Bootstrap, and Vitest. The source files in the directory where the app starts are the source of truth. Requirement edits update test descriptions or requirement annotations. Test implementations stay as they are.

- Keep framework support behind `TestFrameworkAdapter`. Compose shared readers and helpers across adapters.
- Keep related files together in `adapters/`, `catalog/`, `changes/`, and `ui/`.
- Use OOP with composition, encapsulation, and polymorphism.
- Follow DRY, SRP, and YAGNI. Generalize as similar patterns emerge and prefer expressive abstractions.
- Optimize for readable code, expressive names, and straightforward flows. Comments should explain useful context.
- Use US English. Prefer affirmative, class-inclusive wording; accurate conditions may use negation.
- Prefer the primary path inside an `if` branch and ordinary fallback flow inside `else` when that improves readability.
- Name getters with `retrieve`, such as `retrieveSnapshot`.
- Document value units in comments and keep units out of identifiers.
- Use familiar words in identifiers and prose.
- Clean up temporary files when their purpose is complete.

# Testing

- Place test files next to the source files they exercise.
- Test expected behavior through public APIs and use production behavior in tests.
- Use Vitest for unit tests.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` for relevant changes.

# UI

- Use Bootstrap and a minimal UI focused on the required functionality.
- Assume familiarity with common web patterns and keep text direct.
- Right-align form submit buttons.
- Autofocus the first field when the page primarily presents one form.
- Preserve row height, focus, drafts, scroll position, and expanded suites during live updates.

# Git and publication

- Use `main` for integrated development. Start ordinary work on `codex/<task>`, validate it, and merge completed work into `main`.
- Keep release work on task branches or behind feature flags until it is ready.
- Development requests authorize implementation and testing. Public publication and deployment follow explicit user requests.
- Select and validate a committed revision before publishing it.
- Every commit created by Codex must include exactly one trailer:

  `Co-authored-by: Codex <noreply@openai.com>`

- Use the GitHub account `codex.sanjo.solutions@gmail.com` for Codex GitHub interactions.
- Attribute Codex-authored GitHub content to Codex.
- Keep commits focused on related changes so each change can be reviewed and reverted independently.

# Communication

- Respect the user's time. Use available context and investigate before requesting more information.
- Write politely, directly, and in the user's writing style.
- Prepare customer messages for user review; the user sends them.
