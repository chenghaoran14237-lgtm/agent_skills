# Delivery Checklist

## Before Recording

- Scene manifest exists and matches the latest narration.
- All services are running.
- Browser can load each service and find required text.
- Voiceover and SRT were regenerated after the latest narration edit.
- `check-environment.mjs` passes on the current machine.
- `validate-scene-plan.mjs` passes.
- Recorder syntax check passes.
- Voice mode is explicit: `edge-tts`, `provided`, or `reference`.
- If using a reference voice, the reference audio and provider command are present.

## During Recording

- No internal/development wording appears.
- Chat input text appears before send when that interaction is being demonstrated.
- Loading indicators and old option cards disappear at the right time.
- Drawers open next to the list/table row being discussed.
- Inner module scroll positions are preserved where needed.
- Run log is being written and includes every scene.

## After Recording

Always confirm:

```bash
ls -lh final.mp4
node /path/to/skill/scripts/verify-sync.mjs scene-plan.json
node /path/to/skill/scripts/probe-video.mjs scene-plan.json
```

If the user did not opt out, inspect representative frames:

- first configuration scene
- main Agent workflow
- risk/context drawer
- admin/config page
- final recap

Use `visual-check.mjs` for the default finite frame check. Keep the default to 6 frames and never exceed 10 unless the user explicitly asks for strict QA.

If the user says "不用抽帧检查", skip frame checks only. Still confirm audio/video streams.

## Final Response

Keep it short:

- final MP4 path
- transcript/subtitle path when relevant
- checks run
- frame checks skipped if requested
