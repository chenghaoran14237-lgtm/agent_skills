# Agent Skills

This repository stores personal Codex skills. Each skill lives in its own
folder so it can be copied, installed, or updated independently.

## Skills

- [`chr-governance`](./chr-governance/) - Git-aware project documentation
  governance for Codex. Use it for `chr:check`, `chr:sync`, `chr:gc`, and
  requests like `用 chr 进行文档治理`. It initializes and governs `AGENTS.md`,
  `DOCS_POLICY.md`, `.chr.toml`, `.chr/waivers.toml`, active project docs, and
  OpenSpec docs. It anchors checks to local git state and reports which
  documents may need review after code or spec changes.
