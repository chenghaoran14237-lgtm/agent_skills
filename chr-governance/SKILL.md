---
name: chr-governance
description: Govern project documentation and AI-facing instruction files with CHR. Use when the user says chr:check, chr:sync, chr:gc, "use chr for document governance", "用 chr 进行文档治理", or asks to initialize, check, synchronize, or clean AGENTS.md, DOCS_POLICY.md, .chr.toml, governed docs, OpenSpec docs, stale docs, superseded docs, archived docs, waivers, or git-aware documentation impact.
---

# CHR Governance

CHR is a lightweight project-fact governance layer. It keeps Codex anchored to
current, trusted documents and the local git state. It does not replace tests,
OpenSpec validation, code review, debugging, release workflows, or architecture
audits.

## Core Rules

- Treat only `status: active` governed documents as current implementation
  authority.
- Treat `draft`, `deprecated`, `superseded`, and `archived` documents as
  non-current unless explicitly needed as history.
- Treat `README.md` as a human portal by default, not implementation authority.
- Treat `AGENTS.md` as an agent entry map, not a knowledge base.
- Anchor checks to `HEAD` plus staged, unstaged, and untracked local changes.
- Say "affected document was touched" or "may need review"; do not claim that a
  document is semantically synchronized unless the content was actually reviewed.

## Deterministic Script

Prefer the bundled script for checks:

```bash
python3 <skill-dir>/scripts/chr.py check --root <repo>
```

Python 3.11+ is required. The script reads `.chr.toml`, `.chr/waivers.toml`,
governed document frontmatter, relative links, and local git status.

Legacy wrappers are kept for compatibility:

```bash
python3 <skill-dir>/scripts/check_docs_lifecycle.py --root <repo>
python3 <skill-dir>/scripts/docs_inventory.py --root <repo>
```

## User Workflows

### General request: "use chr for document governance"

1. Run `scripts/chr.py check --root <repo>`.
2. If the project is `not_initialized`, run `scripts/chr.py init --root <repo>`
   unless the user requested check-only behavior.
3. Fix deterministic governance issues you can safely fix: missing metadata,
   broken governed links, stale `AGENTS.md` links, superseded/archived references,
   and missing minimal governance entry files.
4. Use the git-aware impact report to identify affected active docs. Update only
   docs that are clearly affected by the local changes.
5. If an impact is real but intentionally does not require a doc update, add a
   time-limited waiver in `.chr/waivers.toml`.
6. If impact semantics are unclear, leave a warning in the final answer instead
   of inventing architecture claims.
7. Run `scripts/chr.py check --root <repo>` again and report the version anchor,
   changed governance files, and remaining warnings.

### `chr:check`

Run the checker and report health. Do not edit files.

### `chr:sync`

After code/spec/product changes, run the checker, update affected active docs,
adjust lifecycle metadata on touched docs, add waivers only when justified, and
run the checker again.

### `chr:gc`

Run the checker and clean lifecycle issues the user expects you to clean now.
CHR is not a daemon; cleanup is user-triggered or stage-triggered. Do not rely on
time passing to perform cleanup automatically.

## References

Load only what is needed:

- `references/commands.md`: command behavior and final-report expectations.
- `references/project-config.md`: `.chr.toml` and `.chr/waivers.toml` schema.
- `references/frontmatter.md`: governance metadata and status semantics.
- `references/agents-md-rules.md`: `AGENTS.md` constraints.
- `references/policy-template.md`: recommended `DOCS_POLICY.md`.
- `references/openspec-integration.md`: CHR and OpenSpec boundaries.
- `references/gc-checklist.md`: user-triggered cleanup checklist.
