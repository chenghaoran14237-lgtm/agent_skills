# Troubleshooting

## Audio and Page Are Out of Sync

Likely causes:

- voiceover changed but SRT did not
- scene count changed but recorder still uses old cue indexes
- fixed waits replaced UI-state waits
- recording start delay not accounted for

Fix:

1. Regenerate voiceover and SRT from the latest narration.
2. Validate audio duration vs SRT last cue.
3. Move cue indexes into `scene-plan.json`.
4. Record with `record-runner.mjs` so a run log is produced.
5. Run `verify-sync.mjs` and fix every scene where checks complete after the cue window.

## A Drawer Opens but the List Jumps Away

Cause: rendering resets the module scroll position.

Fix:

- store inner scroller `scrollTop` before click
- restore it after drawer render
- verify the clicked row/list remains visible beside the drawer

## Chat Option Card and Text Behave Wrong

For choice cards:

- before user selection: show the card only if the card contains the options
- after user selection: remove the card and leave the text list in chat history if requested
- wait for the old card to disappear before the next scene

## TTS Splits Text into Unexpected SRT Cues

Fix options:

- split narration paragraphs more explicitly
- use `cueRange` in the manifest
- merge adjacent cues in the manifest mapping
- never assume one paragraph always equals one cue

## Netlify/External Pages Differ from Local Pages

Before recording deployed pages:

- check HTTP 200 for `index.html`, JS, CSS, and assets
- load with Playwright and verify required text
- verify any relative asset paths

## Final MP4 Has No Audio

Check:

```bash
ffprobe -v error -show_streams final.mp4
```

Confirm the second ffmpeg command maps audio:

```bash
-map 0:v:0 -map "[a]" -c:a aac
```

## Final MP4 Ends Early

Likely caused by `-shortest` and a video or audio track shorter than expected. Add a final hold in the recorder or pad audio with `apad`.

## Reference Voice Does Not Match

Reference voice mode depends on the configured provider command. If the output timbre is wrong:

- confirm `voice.referenceAudio` points to the intended sample
- confirm the provider command receives `{referenceAudio}`
- do not silently switch to a default TTS voice
- regenerate audio and SRT, then rerun validation and sync verification

## Speech Speed Changed but Sync Broke

Cause: audio was sped up or slowed down without retiming subtitles.

Fix:

- use `adjust-voice-speed.mjs` with both audio and SRT arguments
- update `scene-plan.json` to the new audio and SRT
- rerun `validate-scene-plan.mjs` and `verify-sync.mjs`
