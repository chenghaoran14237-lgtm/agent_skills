---
name: demo-video-producer
description: Produce stable customer-facing demo videos from local or deployed web apps. Use when Codex needs to script, record, revise, or deliver product demo MP4s with voiceover, subtitles, Playwright browser automation, page switching, UI highlights, scene timing, ffmpeg composition, transcript/subtitle artifacts, or acceptance checks. Especially useful for Chinese business demo videos and Agent/chatbot plus admin-console workflows.
---

# Demo Video Producer

Use this skill to turn a product scenario and working UI into a stable demo MP4. The default outcome is:

- a customer-facing script and scene manifest
- synchronized voiceover and subtitles
- Playwright-recorded browser video
- final MP4 with audio/video tracks
- transcript/subtitle files and a short delivery report

## Non-Negotiables

1. Build a scene manifest before recording. Every narration segment must map to a concrete page action and target UI state.
2. Treat the manifest as the source of truth for timing. Do not hand-place actions only by guessed wall-clock offsets.
3. Regenerate subtitles whenever narration or voiceover changes. Validate subtitle count and audio duration before recording.
4. Wait for real UI states: text visible, cards gone, drawers open, spinners gone, module scroll position correct.
5. Keep the primary user-facing app as the main camera. Switch to admin/config pages only when the narration needs configuration, audit, routing, rules, or observability proof.
6. Hide internal implementation language from the video: local ports, file names, mocks, tests, selectors, code names, and temporary tooling.
7. Verify audio/video sync with the run log and SRT cue timing after recording. If sync verification fails, do not deliver the MP4 as final.
8. If the user asks to skip frame checks, skip screenshots only. Still run file existence, sync, and `ffprobe` audio/video checks.

## Portability Contract

This skill must work when copied into a different Codex environment. Do not depend on files from the original project, fixed local ports, personal shell aliases, or project-specific script names. Before recording, run the environment check and make any project-specific recorder changes from the manifest, not from hidden assumptions.

## Workflow

1. Read the current user requirements and latest script. If the user edited an existing narration file, use that file as the authoritative text.
2. Draft or update `scene-plan.json` using `references/scene-manifest.md`.
3. Use `scripts/record-runner.mjs` as the recorder. Put project-specific behavior in `custom-actions.mjs` only when built-in actions are insufficient.
4. Generate TTS and subtitles, or validate user-provided voiceover/SRT. Use `references/voice-and-subtitles.md` for voice profile, reference voice, speed, and subtitle handling.
5. Run `scripts/check-environment.mjs` and `scripts/validate-scene-plan.mjs` before recording.
6. Record with `scripts/record-runner.mjs`, using the manifest to drive actions, checks, SRT/cueRange timing, and a run log.
7. Compose with ffmpeg. Use `references/recording-pattern.md` for browser recording and muxing rules.
8. Run `scripts/verify-sync.mjs` and `scripts/probe-video.mjs` on the final MP4. Run finite `scripts/visual-check.mjs` unless the user asked to skip frame checks.
9. Deliver the MP4 path, subtitle/transcript paths, run log, and checks run. Mention skipped frame checks only if the user requested that.

## Reference Loading

Load only what is needed:

- `references/production-workflow.md`: end-to-end production process and decision rules.
- `references/scene-manifest.md`: required manifest schema and examples.
- `references/recording-pattern.md`: Playwright, timing, page switching, scroll/drawer, and ffmpeg patterns.
- `references/voice-and-subtitles.md`: TTS generation, SRT alignment, transcript extraction.
- `references/customer-facing-script.md`: customer-safe narration style.
- `references/delivery-checklist.md`: final verification and handoff.
- `references/troubleshooting.md`: common sync, UI, and deploy issues.

## Bundled Scripts

- `scripts/check-environment.mjs`: verify Node.js, Playwright, ffmpeg, ffprobe, and optional TTS tooling before production.
- `scripts/prepare-voice.mjs <scene-plan.json>`: generate or validate voiceover/SRT from the manifest voice settings.
- `scripts/adjust-voice-speed.mjs <input> <output> <factor> [input.srt] [output.srt]`: adjust narration speed and retime SRT together.
- `scripts/validate-scene-plan.mjs [scene-plan.json]`: check manifest shape, duplicate IDs, missing selectors, subtitle cue counts, and audio/SRT duration drift.
- `scripts/record-runner.mjs <scene-plan.json>`: manifest-driven Playwright recorder that writes a per-scene run log.
- `scripts/verify-sync.mjs [scene-plan.json] [run-log.json] [final.mp4]`: fail when actual scene timing drifts from SRT/cueRange timing.
- `scripts/visual-check.mjs <scene-plan.json> [final.mp4]`: extract a limited set of checkpoint frames, capped at 10.
- `scripts/srt-to-text.mjs <input.srt> <output.txt>`: create a pure subtitle transcript.
- `scripts/probe-video.mjs [final.mp4|scene-plan.json]`: verify final MP4 has readable video/audio streams and report duration/size.
- `scripts/smoke-record.mjs`: record a tiny bundled fixture to prove the environment can produce a synced MP4.

## Stability Rules

- Prefer selectors with explicit data attributes. If unavailable, use visible text only when it is stable in the UI language.
- Never advance because a fixed timeout elapsed if there is a UI state you can wait for.
- For chat demos, verify these before continuing: user message visible, assistant response visible, loading gone, previous option card gone if expected.
- For admin tables and drawers, scroll the inner module, not the document, then preserve that scroll when opening details.
- Do not leave long-running dev servers or record sessions unmanaged. End required sessions before final response.
