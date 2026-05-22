# Agent Skills

Operational Codex skills for making AI-assisted software development more
repeatable, inspectable, and aligned with the actual project state.

面向真实软件工程场景的 Codex skills，目标是让 AI 辅助开发更可复用、可检查，并且更贴近项目当前事实。

## Skills

### [`demo-video-producer`](./demo-video-producer/)

**EN**

- **Problem it solves:** Produces polished Web application demo videos without
  manual editing. It turns a local or deployed Web project into a narrated MP4
  by using a scene manifest, browser automation, replaceable voiceover,
  subtitles, audio/video sync verification, and delivery checks.
- **Typical scenarios:**
  - creating customer-facing demo videos for Web apps, SaaS tools, dashboards,
    admin consoles, workflow systems, chatbots, Agent products, and internal
    platforms
  - recording a scripted product flow directly from local services or deployed
    URLs
  - generating or validating voiceover/subtitle assets so the video can be
    delivered without opening a video editor
  - validating audio/video synchronization before delivery
  - using replaceable voice samples, provided narration files, or generated TTS
  - extracting finite visual checkpoints instead of doing unbounded frame review
- **How to use:**
  - Ask Codex to use `demo-video-producer` to produce a Web project demo video.
  - Provide the local project path or deployed URL, the demo goal, target
    audience, required flow, preferred duration, and voice requirements.
  - If you already have narration or a reference voice, provide the audio file;
    otherwise Codex can create the narration script and generate/prepare the
    voiceover and subtitles.
  - Codex will create a `scene-plan.json`, record the browser with Playwright,
    compose the final MP4 with ffmpeg, verify sync with the run log and SRT, and
    return the MP4 plus subtitle/transcript/check artifacts.

**中文**

- **解决的问题：** 无需手工剪辑，把本地或线上 Web 项目稳定制作成带配音、字幕、
  浏览器录屏、音画同步校验和交付检查的 MP4 演示视频。
- **典型应用场景：**
  - 为 Web 应用、SaaS 工具、数据看板、配置后台、业务流程系统、chatbot、Agent
    产品和内部平台制作客户演示视频
  - 直接从本地服务或线上 URL 录制一条完整产品流程
  - 生成或校验配音、字幕、纯字幕稿，减少后期剪辑和对齐成本
  - 交付前验证音画同步
  - 使用用户提供的参考音色、已有配音文件，或通过 TTS 生成配音
  - 抽取有限关键帧，避免无上限的人工抽帧检查
- **使用方式：**
  - 让 Codex 使用 `demo-video-producer` 制作 Web 项目演示视频。
  - 提供本地项目路径或线上 URL、演示目标、面向对象、必须展示的流程、期望时长和配音要求。
  - 如果已有配音稿、配音文件或参考音色，直接提供对应文件；如果没有，Codex 可以先写讲解脚本，
    再生成或准备配音与字幕。
  - Codex 会生成 `scene-plan.json`，用 Playwright 录制浏览器，使用 ffmpeg 合成最终 MP4，
    再通过 run log、SRT 和视频探测做音画同步与交付检查，最后返回 MP4、字幕/纯字幕稿和检查产物。

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
