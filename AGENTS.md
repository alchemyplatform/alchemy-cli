# Alchemy CLI Styling Guidelines

## Goal
Keep all terminal output visually consistent with existing Alchemy CLI conventions used by help, tables, and command output.

## Core Principles
- Prefer shared style helpers in `src/lib/ui.ts`, `src/lib/output.ts`, and `src/lib/error-format.ts` over ad-hoc ANSI strings.
- Use one visual voice: indented blocks, compact spacing, and consistent symbols (`◆` for section headers, `✗` for errors, `✓` for success).
- Keep copy short and actionable.

## Color and Modes
- Human TTY mode: use ANSI styling.
- `--json` mode: no ANSI styling; emit valid JSON only.
- Respect `NO_COLOR`: disable ANSI styling when present.
- If `stderr`/`stdout` is not a TTY, avoid adding terminal-only styling.

## Error Presentation
- All errors should flow through shared formatters.
- Commander parse/usage errors should be formatted via `formatCommanderError()`.
- Application errors should be printed via `printError()`.
- Error blocks should use:
  - red `✗` badge + error label/code
  - red primary error message
  - dim secondary lines (hints, usage details)

## Output Hierarchy
- Section title: branded header style (`◆` + brand color).
- Primary content: normal contrast.
- Secondary/help text: dim.
- Avoid mixing unrelated accent colors in a single block.

## Implementation Notes
- When adding new output, first check whether an existing helper already fits.
- If a new pattern is needed, add a shared helper once, then reuse it.
