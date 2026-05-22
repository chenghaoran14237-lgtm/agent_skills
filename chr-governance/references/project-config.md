# CHR Project Configuration

CHR uses `.chr.toml` for machine-readable project structure and
`.chr/waivers.toml` for temporary exemptions.

## `.chr.toml`

Minimum shape:

```toml
version = 1

readme_role = "portal"
base_branches = ["origin/main", "origin/master", "main", "master"]
entry_docs = ["AGENTS.md", "DOCS_POLICY.md"]
doc_roots = ["docs", "openspec/specs", "openspec/changes"]
non_authoritative = ["README.md", "docs/archive/**", "openspec/changes/archive/**"]
ignore_paths = ["dist/**", "build/**", "target/**", "node_modules/**", ".venv/**", "venv/**"]

[[risk_paths]]
glob = "src/services/**"
docs = ["docs/architecture.md"]
triggers = ["architecture_boundary"]
enforce = false
suggest_decision = true
```

Rules:

- `version` must be `1`.
- `readme_role` is `portal`, `authority`, or `ignored`; default is `portal`.
- `entry_docs` are root-level governance entry files.
- `doc_roots` are governed documentation roots.
- `ignore_paths` wins over `risk_paths`.
- `risk_paths` maps changed code paths to active docs that may need review.
- `enforce = true` should be rare. Local checks stay advisory; CI may turn that
  rule into an error.

## README Role

Default:

```toml
readme_role = "portal"
```

`README.md` is then a human project portal, not implementation authority.
`AGENTS.md` is the Codex entry map. Use `readme_role = "authority"` only for
small projects that intentionally make README governed implementation truth.

## Waivers

Use `.chr/waivers.toml` for intentional non-impacting changes:

```toml
[[waivers]]
id = "2026-05-22-internal-refactor"
paths = ["src/services/InternalCache.cs"]
docs = ["docs/architecture.md"]
triggers = ["architecture_boundary"]
reason = "Internal refactor, no architecture or contract change."
expires_on = "2026-06-05"
```

Rules:

- Waivers must have `id`, `paths`, `docs`, `reason`, and `expires_on`.
- Keep paths and docs narrow.
- Prefer adding `triggers` so the waiver does not hide unrelated impact.
- Expired waivers are warnings locally and errors in CI mode.
