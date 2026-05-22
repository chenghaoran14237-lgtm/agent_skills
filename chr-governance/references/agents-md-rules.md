# AGENTS.md Governance Rules

`AGENTS.md` is high-impact because agents read it as the repository entry map. It must be short and current.

## Rules

- Must exist in the project root when the project expects agent participation.
- Must have governance frontmatter.
- Must be an entry map, not a product or architecture encyclopedia.
- Must link only to active documents unless explicitly labeling history.
- Must not duplicate long product requirements or architecture details.
- Must describe where to find current truth.
- Must list required checks if the repo has them.
- Must state that stale, archived, superseded, or draft docs are not implementation authority.
- Should state that `README.md` is a human portal unless `.chr.toml` explicitly makes it authoritative.
- Should point to `.chr.toml` so Codex can find git-aware documentation impact rules.

## Length Guidance

- Target: <= 150 lines.
- Warning: > 220 lines.
- Error: > 300 lines.

When it grows, move details into `DOCS_POLICY.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, or `docs/`.
