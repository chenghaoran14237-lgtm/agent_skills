# Governance Cleanup Checklist

Run cleanup when the user requests `chr:gc`, asks for document governance, or a
development stage has finished. CHR is not a background service.

Check:

- Root `AGENTS.md` exists, is short, and points to current active docs.
- `DOCS_POLICY.md` exists and is active.
- `.chr.toml` exists and matches the current project structure.
- Active docs with stale `review_after` are reviewed only if the project uses
  review dates.
- Expired drafts are promoted, archived, or removed when cleanup is requested.
- Superseded docs set `superseded_by`.
- Archived and superseded docs are not cited as current authority.
- Links resolve.
- OpenSpec archived changes are not used as current implementation truth.
- Waivers are narrow, justified, and unexpired.
- Stable documented rules are candidates for lint, tests, or CI.

Prefer small, focused cleanup changes:

- `docs: initialize CHR governance`
- `docs: refresh agent entry map`
- `docs: mark old contract note superseded`
- `docs: remove expired CHR waiver`
