# Production Workflow

## 1. Establish the Story

Convert the user's request into a customer-facing story:

- user role and daily workflow
- business pain
- main app actions
- config/admin proof points
- risk, handoff, audit, or outcome

Keep the main app as the primary camera. Use config/admin pages only when the narration needs rules, routing, thresholds, permissions, audit, or operational controls.

## 2. Prepare the Source Files

Create or update:

- `scene-plan.json`: exact narration/action mapping.
- narration text: one paragraph per scene or a clearly segmentable script.
- subtitle output: SRT from the generated voice.
- transcript output: pure text for review.
- run log output: per-scene timing from the recorder.

If the user manually edits a narration file, treat it as authoritative. Regenerate voice and subtitles from that edited file before recording.

## 3. Start Services

Start every required local service before recording. Verify each service URL with a cheap HTTP check and a browser check for required text.

Recommended:

```bash
curl -I http://127.0.0.1:5176/
curl -I http://127.0.0.1:5188/
```

Keep service ports configurable in the recorder through environment variables.

## 4. Validate Before Recording

Run:

```bash
node /path/to/skill/scripts/check-environment.mjs
node /path/to/skill/scripts/prepare-voice.mjs scene-plan.json
node /path/to/skill/scripts/validate-scene-plan.mjs scene-plan.json
node --check /path/to/skill/scripts/record-runner.mjs
```

If Playwright is intentionally installed outside the target project, set `PLAYWRIGHT_PATH` to the package path before running the checks and recorder. Do not hard-code a personal absolute dependency path in reusable scripts.

Validation must fail when:

- audio exists but SRT is missing
- SRT duration differs materially from audio duration
- a scene references a missing cue
- duplicate scene IDs exist
- a scene has narration but no actions or checks

## 5. Record

Use Playwright. Recommended defaults:

- headless Chromium unless visual debugging is needed
- fixed viewport and record size
- selectors over screenshots
- state waits over fixed waits
- inner-module scrolls over document scrolls
- scene timing derived from SRT `cueRange` or one-cue-per-scene mapping
- write a run log with actual scene start, actions completed, checks completed, and scene end times

For chat UIs:

- type text visibly before submitting
- wait for the user message
- wait for the assistant response
- wait for loading/spinner removal
- verify old choice cards disappear when expected

For config/admin UIs:

- preserve left navigation
- keep drawers and side panels aligned with the clicked row
- if a table row opens a drawer, keep the table list visible on the left
- scroll only the relevant module, not the whole page

## 6. Compose

Use ffmpeg to produce a browser-compatible MP4:

- H.264 video
- AAC audio
- `yuv420p`
- `+faststart`

If subtitles must be burned in, render them in-browser during recording or use ffmpeg subtitle filters after recording. If the user only asked for an MP4 with voiceover, external SRT plus transcript is acceptable unless otherwise specified.

## 7. Verify and Deliver

Always run:

```bash
node /path/to/skill/scripts/verify-sync.mjs scene-plan.json
node /path/to/skill/scripts/probe-video.mjs scene-plan.json
```

Verification levels:

- Required: manifest validation, audio/SRT drift, run-log/SRT sync, MP4 stream probe.
- Standard: extract a finite set of checkpoint frames with `visual-check.mjs`; default 6, hard cap 10.
- Strict: only when the user explicitly asks for deeper visual QA.

If the user opts out of frame checks, skip only Standard/Strict frame extraction. Required checks still run.
