# Agent Skills

Operational Codex skills for making AI-assisted software development more
repeatable, inspectable, and aligned with the actual project state.

面向真实软件工程场景的 Codex skills，目标是让 AI 辅助开发更可复用、可检查，并且更贴近项目当前事实。

## Skills

### [`demo-video-producer`](./demo-video-producer/)

**EN**

- **Problem it solves:** Produces stable customer-facing product demo videos from
  a scene manifest, voiceover/subtitle files, Playwright browser recording, sync
  verification, and final MP4 checks.
- **Typical scenarios:**
  - recording chatbot plus admin-console product demos
  - validating audio/video synchronization before delivery
  - using replaceable voice samples or provided narration assets
  - extracting finite visual checkpoints instead of doing unbounded frame review
- **How to use:**
  - Ask Codex to use `demo-video-producer` for a product demo MP4.
  - Provide the target app URL or local project, narration requirements, and any
    reference voice assets.

**中文**

- **解决的问题：** 基于场景清单、配音/字幕、Playwright 录屏、音画同步校验和
  MP4 探测，稳定生成面向客户的产品演示视频。
- **典型应用场景：**
  - 录制 chatbot + 配置中台一类的产品演示
  - 交付前验证音画同步
  - 使用用户提供的音色或现成配音文件
  - 抽取有限关键帧，避免无上限的人工抽帧检查
- **使用方式：**
  - 让 Codex 使用 `demo-video-producer` 生成演示视频。
  - 提供目标页面、本地项目、讲解要求，以及可选参考音频。

### [`chr-governance`](./chr-governance/)

**EN**

- **Problem it solves:** Codex can drift when it reads stale architecture notes,
  outdated specs, archived OpenSpec changes, or an oversized `AGENTS.md` as if
  they were current truth. `chr-governance` gives Codex a lightweight governance
  workflow for deciding which project documents are authoritative and which docs
  may need review after local code changes.
- **Typical scenarios:**
  - starting governance in an existing repository that has no clear agent entry
    point
  - checking whether `AGENTS.md`, `DOCS_POLICY.md`, `.chr.toml`, and active docs
    are healthy before or after a development task
  - using local git state to see which architecture, contract, or OpenSpec docs
    may be affected by staged, unstaged, or untracked changes
  - cleaning stale, superseded, archived, or draft documentation when a project
    phase finishes
  - adding time-limited waivers when a risky-looking code change intentionally
    does not require a documentation update
- **How to use:**
  - Ask Codex: `use chr for document governance`
  - Or invoke specific flows: `chr:check`, `chr:sync`, `chr:gc`
  - The skill can initialize minimal governance files, run deterministic checks,
    report a git version anchor, and identify documents that may need review.
- **Boundary:** It does not prove that code and documents are semantically
  identical. It reports deterministic governance health and likely documentation
  impact. A document being touched is treated as a weak signal, not proof of
  synchronization.

**中文**

- **解决的问题：** Codex 在开发时容易被过期架构说明、旧规格、已归档的 OpenSpec
  change，或者膨胀的 `AGENTS.md` 误导，从而把历史信息当成当前事实。
  `chr-governance` 提供一套轻量文档治理流程，帮助 Codex 判断哪些项目文档是当前权威，
  以及本地代码变更后哪些文档可能需要复查。
- **典型应用场景：**
  - 给缺少 agent 入口的老项目建立最小文档治理入口
  - 在开发任务开始前或结束后检查 `AGENTS.md`、`DOCS_POLICY.md`、`.chr.toml`
    和 active 文档是否健康
  - 基于本地 git 状态识别 staged、unstaged、untracked 变更可能影响哪些架构、契约或
    OpenSpec 文档
  - 在阶段性开发完成后清理 stale、superseded、archived、draft 文档
  - 当某个看似高风险的代码变更实际上不需要更新文档时，记录带过期时间的 waiver
- **使用方式：**
  - 直接告诉 Codex：`用 chr 进行文档治理`
  - 或使用明确流程：`chr:check`、`chr:sync`、`chr:gc`
  - 这个 skill 可以初始化最小治理文件、运行确定性检查、报告 git 版本锚点，并指出哪些文档可能需要复查。
- **边界：** 它不会证明代码和文档在语义上完全一致。它只报告确定性的文档治理健康度和可能的文档影响面。
  文档被修改只能说明它被触达过，不能等同于“已经同步正确”。
