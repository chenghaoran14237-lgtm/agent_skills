# Voice And Subtitles

## Approved Mandarin Business Voice

Default for Chinese customer-facing demo videos:

```bash
edge-tts \
  -f narration.txt \
  -v zh-CN-YunjianNeural \
  --rate=+4% \
  --pitch=-2Hz \
  --volume=+8% \
  --write-media voiceover-raw.mp3 \
  --write-subtitles subtitles.srt
```

The same values can live in `scene-plan.json`:

```json
{
  "voice": {
    "mode": "edge-tts",
    "voice": "zh-CN-YunjianNeural",
    "rate": "+4%",
    "pitch": "-2Hz",
    "volume": "+8%"
  }
}
```

Generate through the bundled script:

```bash
node /path/to/skill/scripts/prepare-voice.mjs scene-plan.json
```

Post-process voiceover:

```bash
ffmpeg -y -i voiceover-raw.mp3 \
  -af "highpass=f=70,acompressor=threshold=-18dB:ratio=2.2:attack=18:release=180,loudnorm=I=-16:TP=-1.5:LRA=9" \
  -c:a libmp3lame -b:a 128k voiceover-enhanced.mp3
```

## Narration Source of Truth

If the user modifies narration text, do not use stale audio or stale SRT. Regenerate both from the edited narration file.

Recommended files:

- `dist/voiceover/narration.txt`
- `dist/voiceover/voiceover-raw.mp3`
- `dist/voiceover/voiceover-enhanced.mp3`
- `dist/voiceover/subtitles.srt`
- `dist/voiceover/subtitles.txt`

## Replaceable Voice

Support three voice modes:

- `edge-tts`: use a named system/TTS voice and parameters.
- `provided`: the user provides final audio and SRT; validate them, do not regenerate.
- `reference`: the user provides a reference audio file for a voice-cloning or custom TTS provider.

Reference voice mode is provider-neutral because available cloning tools differ by machine and account. Configure it like this:

```json
{
  "voice": {
    "mode": "reference",
    "referenceAudio": "assets/voice/reference.wav",
    "cloneCommand": "voice-clone --ref {referenceAudio} --text {narration} --audio {finalAudio} --srt {srt}"
  }
}
```

If `cloneCommand` is absent, `prepare-voice.mjs` must stop and tell the user that a provider command is required. Do not silently fall back to a different timbre.

## Speech Rate

Prefer setting rate in the TTS provider before generating audio. If the voice is otherwise approved but the pacing is off, adjust in post and retime subtitles together:

```bash
node /path/to/skill/scripts/adjust-voice-speed.mjs \
  voiceover-enhanced.mp3 voiceover-115.mp3 1.15 \
  subtitles.srt subtitles-115.srt
```

After any speed change, update `scene-plan.json` to point at the new audio and SRT, then rerun validation and sync verification. Never speed up audio without retiming SRT.

## SRT Handling

SRT is useful for timing but fragile as a scene source because TTS may split sentences differently. Use one of these patterns:

- Preferred: one paragraph per scene and validate cue mapping.
- Robust: scene manifest includes `cueRange` per scene.
- Avoid: recorder code hard-codes cue indexes without manifest validation.

## Transcript Extraction

Use:

```bash
node /path/to/skill/scripts/srt-to-text.mjs subtitles.srt subtitles.txt
```

Pure transcript files are easier for user review than SRT.

## Drift Checks

Before recording:

1. `ffprobe` audio duration.
2. Parse SRT last cue end time.
3. Fail or warn if drift is more than 1500 ms.
4. Confirm scene count/cue mapping with `validate-scene-plan.mjs`.

## Sync Checks

After recording, run:

```bash
node /path/to/skill/scripts/verify-sync.mjs scene-plan.json
```

This compares the run log against subtitle cue timing. If a scene starts late, or the UI state is not verified before the narration cue finishes within tolerance, fix the scene actions/timing and record again.

## User Edits

When the user says they edited the voiceover/script file:

1. Read that file.
2. Regenerate audio and SRT.
3. Update/validate the scene manifest.
4. Record only after validation passes.
