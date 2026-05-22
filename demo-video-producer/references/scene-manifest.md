# Scene Manifest

Use a scene manifest to keep voiceover, subtitles, page actions, and verification aligned. Create it before recording and update it whenever narration changes.

## Required Shape

```json
{
  "project": "product-demo",
  "version": "v1",
  "viewport": { "width": 1440, "height": 900 },
  "voice": {
    "mode": "edge-tts",
    "voice": "zh-CN-YunjianNeural",
    "rate": "+4%"
  },
  "sync": {
    "startToleranceMs": 700,
    "visibleToleranceMs": 1200,
    "endToleranceMs": 1800
  },
  "output": {
    "video": "dist/final.mp4",
    "voiceover": "dist/voiceover/final.mp3",
    "srt": "dist/voiceover/final.srt",
    "transcript": "dist/voiceover/final.txt",
    "runLog": "dist/final.run-log.json",
    "visualCheckDir": "dist/video-checks",
    "audioDelayMs": 0
  },
  "services": [
    { "id": "main", "url": "http://127.0.0.1:5176/", "requiredText": "工作台" },
    { "id": "admin", "url": "http://127.0.0.1:5188/", "requiredText": "配置中心" }
  ],
  "scenes": [
    {
      "id": "create-agent",
      "page": "main",
      "narration": "进入工作台后，我可以直接通过对话创建一个业务 Agent。",
      "actions": [
        { "type": "clickText", "text": "创建 Agent" },
        { "type": "waitText", "text": "选择知识库" }
      ],
      "target": { "selector": ".configuration-card", "description": "基础能力选择卡片" },
      "checks": [
        { "type": "visibleText", "text": "选择知识库" }
      ]
    }
  ]
}
```

## Scene Fields

- `id`: stable kebab-case ID. Never reuse an ID for a different scene.
- `page`: service ID from `services`.
- `narration`: exact spoken text for this scene. This must match generated subtitles.
- `actions`: ordered UI actions. Use semantic actions, not comments.
- `target`: the UI element being discussed. Used for highlighting or visual verification.
- `checks`: state assertions after the actions. Include spinner/card disappearance when relevant.
- `minHoldMs` optional: extra hold when a dense UI needs inspection.
- `postHoldMs` optional: extra hold after the mapped subtitle cue when using SRT timing.
- `allowPassive` optional: set only for intentional hold-only scenes; otherwise validation fails when actions or checks are missing.
- `checkpoint` optional: mark important scenes for finite frame extraction.
- `notes` optional: internal guidance; do not read notes aloud.

## Voice Fields

- `voice.mode`: `edge-tts`, `provided`, or `reference`.
- `voice.voice`, `rate`, `pitch`, `volume`: TTS parameters for generated voices.
- `voice.referenceAudio`: user-provided voice sample for reference/custom voice mode.
- `voice.cloneCommand`: provider command template for reference voice mode.

## Sync Fields

- `startToleranceMs`: allowed drift between subtitle cue start and actual scene start.
- `visibleToleranceMs`: allowed delay after cue end for required UI checks.
- `endToleranceMs`: allowed delay after expected post-hold.

## Output Fields

- `voiceover` and `srt` are required. This skill does not support silent delivery videos because sync verification depends on the narrated timeline.
- `audioDelayMs` optional: non-negative audio delay in milliseconds. The recorder shifts scene timing by this amount and `verify-sync.mjs` checks the delayed final timeline.

## Supported Action Vocabulary

Recorders may implement more, but prefer these names:

- `goto`: open a service/page URL.
- `clickText`: click a visible button or link by text.
- `clickSelector`: click a stable selector.
- `typeAndSend`: type visible text into an input, hold briefly, then submit.
- `waitText`: wait for visible text.
- `waitGone`: wait for selector/text to disappear.
- `scrollIntoView`: scroll an inner module target into view.
- `scrollModule`: set a specific inner module scroll position.
- `openDrawer`: click row/card and wait for drawer.
- `switchPage`: navigate from one service to another.
- `hold`: wait for narration/readability.

## Timing Contract

Use subtitles or scene voice durations to drive timing:

1. Generate one subtitle cue per scene whenever possible.
2. If TTS splits a scene into multiple SRT cues, either merge cues or add `cueRange`.
3. Fail recording when scene count and subtitle mapping disagree.
4. Keep scene hold to voice duration plus 400-800 ms unless UI needs inspection.

## Stable Mapping Pattern

Preferred:

```json
{ "id": "risk-context", "cueRange": [36, 38], "actions": [...] }
```

Avoid:

```js
riskContext: start(38)
```

Hard-coded cue indexes in recorder code are fragile. Put cue indexes in the manifest so validation can catch mismatch before recording.
