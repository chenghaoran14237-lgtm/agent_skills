# Agent Skills

This repository stores personal Codex skills. Each skill lives in its own folder
so it can be copied, installed, or updated independently.

这个仓库用于存放个人 Codex skills。每个 skill 都放在独立文件夹中，便于单独复制、安装和更新。

## Skills

- [`chr-governance`](./chr-governance/)
  - EN: Git-aware project documentation governance for Codex. Use it for
    `chr:check`, `chr:sync`, `chr:gc`, and requests like
    `use chr for document governance`. It initializes and governs `AGENTS.md`,
    `DOCS_POLICY.md`, `.chr.toml`, `.chr/waivers.toml`, active project docs, and
    OpenSpec docs. It anchors checks to local git state and reports which
    documents may need review after code or spec changes.
  - 中文：面向 Codex 的 Git 感知项目文档治理 skill。适用于 `chr:check`、
    `chr:sync`、`chr:gc`，以及 `用 chr 进行文档治理` 这类请求。它可以初始化并治理
    `AGENTS.md`、`DOCS_POLICY.md`、`.chr.toml`、`.chr/waivers.toml`、
    active 项目文档和 OpenSpec 文档，并基于本地 git 状态报告代码或规格变更后哪些文档可能需要复查。
