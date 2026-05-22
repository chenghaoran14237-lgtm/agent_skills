# Governance Frontmatter

Frontmatter describes document lifecycle and authority. It should not carry
complex code-path mappings; use `.chr.toml` for project structure.

Recommended Markdown frontmatter:

```yaml
---
status: active
owner: engineering
last_reviewed: 2026-05-22
review_after:
expires_on:
superseded_by:
doc_type: architecture
authority: high
---
```

Required fields:

- `status`
- `owner`
- `last_reviewed`
- `doc_type`
- `authority`

Optional fields:

- `review_after`: advisory only; CHR checks it when invoked, but CHR is not a
  background service.
- `expires_on`: recommended for drafts and waivers.
- `superseded_by`: required when `status: superseded`.

Allowed statuses:

- `draft`: discussion only, not current implementation authority.
- `active`: current implementation authority.
- `deprecated`: readable but should not gain new dependencies.
- `superseded`: replaced by another document; must set `superseded_by`.
- `archived`: historical only.

Suggested authority values:

- `critical`: agent behavior or CI-affecting rules.
- `high`: architecture, contracts, agent entry maps, current product specs.
- `medium`: decisions, plans, tech debt.
- `low`: historical notes and exploratory material.

Governed HTML may use equivalent metadata in `<meta>` tags:

```html
<meta name="governance-status" content="active" />
<meta name="governance-owner" content="engineering" />
<meta name="governance-last-reviewed" content="2026-05-22" />
<meta name="governance-doc-type" content="diagram" />
<meta name="governance-authority" content="high" />
```
