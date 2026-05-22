# DOCS_POLICY.md Template

Use this as a project-level documentation governance policy.

```markdown
---
status: active
owner: engineering
last_reviewed: YYYY-MM-DD
review_after:
expires_on:
superseded_by:
doc_type: policy
authority: high
---

# Documentation Governance Policy

## Governed Documents

- `AGENTS.md`
- `DOCS_POLICY.md`
- active documents under `docs/`
- active OpenSpec documents under `openspec/specs/` and `openspec/changes/`
- agent instruction, prompt, and skill documents that influence implementation

## Status

- `draft`: discussion only, not implementation authority.
- `active`: current implementation authority.
- `deprecated`: readable, but no new dependencies should be added.
- `superseded`: replaced by another document.
- `archived`: historical background only.

## Trust Order

1. Current code and tests.
2. Active policy, architecture, conventions, and agent-entry docs.
3. Active product, contract, and OpenSpec specs.
4. Decisions and ADRs.
5. Impact maps and OpenSpec changes.
6. Draft, deprecated, superseded, and archived docs.

## Git-Aware Governance

CHR checks are anchored to `HEAD` plus staged, unstaged, and untracked local
changes. A document being touched is a weak signal that it may have been
reviewed; it is not proof that document contents are semantically synchronized.
```
