---
name: changeset
description: Create a changeset file for pending changes
user_invocable: true
---

# Create Changeset

Create a changeset file describing user-facing changes for the current branch.

## Steps

1. **Determine the bump type.** If not provided by the user, ask which applies:
   - `patch` — bug fix or small tweak
   - `minor` — new feature, command, or flag
   - `major` — breaking change (removed/renamed command, changed output format)

2. **Inspect recent changes.** Run `git diff main...HEAD --stat` and read changed files to understand what changed.

3. **Write a summary.** Compose a 1-2 sentence description of the change from a user's perspective. Focus on what changed and why it matters, not implementation details.

4. **Generate the changeset file.** Create `.changeset/<kebab-case-name>.md` with this exact format:

```markdown
---
"@alchemy/cli": <bump-type>
---

<summary>
```

The kebab-case name should be descriptive (e.g., `add-portfolio-command`, `fix-json-output`). Do not use random words.

5. **Confirm.** Show the user the file path and contents for review.

## Rules

- One changeset per logical change. If a PR has multiple independent changes, create multiple files.
- Never use `major` without explicit user confirmation.
- The summary must describe user-visible behavior, not code changes.
- Do not modify existing changeset files unless asked.
