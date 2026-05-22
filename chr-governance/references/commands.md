# CHR Governance Commands

## General Governance Request

When the user says "use chr for document governance" or "用 chr 进行文档治理":

1. Run `python3 <skill-dir>/scripts/chr.py check --root <repo>`.
2. If the project is `not_initialized`, run
   `python3 <skill-dir>/scripts/chr.py init --root <repo>` unless the user asked
   for check-only behavior.
3. Fix deterministic document-governance issues that are safe to fix.
4. Use the git-aware impact report to update clearly affected active documents.
5. Add a waiver only for intentional non-impacting changes, with an expiration.
6. Run `chr.py check` again.
7. Report the version anchor, files changed, remaining errors/warnings, and any
   semantic risks that still need human confirmation.

## `chr:check`

Purpose: report governance health without changing files.

Run:

```bash
python3 <skill-dir>/scripts/chr.py check --root <repo>
```

Report:

- project initialization status
- `HEAD` and local workspace state
- governed document errors and warnings
- git-aware affected documents
- waivers and expired waivers

## `chr:sync`

Purpose: synchronize governed documents after real code/spec/product changes.

Use when:

- product behavior changed
- API/data/config contracts changed
- architecture boundaries changed
- OpenSpec change material was implemented or archived
- agent instructions or project workflow changed

Rules:

- Update only affected active docs.
- Do not claim semantic synchronization just because a doc was touched.
- Mark replaced docs `superseded` with `superseded_by`.
- Update `last_reviewed` on touched docs.
- Leave `review_after` empty unless the project intentionally uses review dates.
- Run `chr.py check` after edits.

## `chr:gc`

Purpose: user-triggered or stage-triggered cleanup.

Actions:

- process expired drafts when the user wants cleanup now
- clean stale links to archived/superseded docs
- keep `AGENTS.md` short
- remove obsolete waivers
- suggest stable rules that should become tests, lint, or CI

CHR is not a daemon. Do not imply that it will clean documents automatically on a
calendar schedule.
