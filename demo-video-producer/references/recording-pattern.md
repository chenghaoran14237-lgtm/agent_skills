# Recording Pattern

## Browser Setup

Use Playwright Chromium:

```js
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: captureDir,
    size: { width: 1440, height: 900 }
  }
});
```

Choose `1440x900` for dense dashboards and `1920x1080` for marketing/demo presentation videos. Keep the viewport, record size, and final encoding consistent.

## Timing

Use a scene clock:

```js
const start = Date.now();
await until(start, scene.startMs);
await runScene(scene);
await until(start, scene.endMs);
```

Derive `scene.startMs/endMs` from the manifest and SRT/audio durations, not from ad hoc guesses in the recorder. If `output.audioDelayMs` is set, apply the same delay to scene timing and sync verification.

The recorder must write a run log for sync verification:

```json
{
  "scenes": [
    {
      "id": "risk-detail",
      "targetStartMs": 183000,
      "targetEndMs": 191000,
      "actualStartMs": 183041,
      "actionsDoneMs": 184220,
      "checksDoneMs": 184900,
      "actualEndMs": 191560
    }
  ]
}
```

After recording, compare the run log to SRT cue timing with `verify-sync.mjs`. If UI checks complete after the spoken cue window, the video is not acceptable even if the MP4 file exists.

## Actions

Use small action helpers:

```js
async function typeAndSend(page, selector, text) {
  const input = page.locator(selector);
  await input.waitFor({ state: "visible" });
  await input.fill("");
  await input.type(text, { delay: text.length <= 2 ? 120 : 42 });
  await page.waitForTimeout(text.length <= 2 ? 420 : 650);
  await page.keyboard.press("Enter");
}
```

Do not skip directly from empty input to submitted message in demos where the viewer needs to see the prompt being entered.

## Waits

Prefer:

- `waitForText`
- `locator.waitFor({ state: "visible" })`
- `waitFor({ state: "hidden" })`
- DOM assertions inside `page.evaluate`

Avoid using only fixed `wait(ms)` when there is a visible target state.

## Page Switching

When switching from an Agent page to a config/admin page:

1. End the prior scene.
2. Navigate to the next service URL.
3. Wait for service-specific required text.
4. Reset any page-specific overlays/highlights.

## Inner Scroll and Drawers

For tables that open a right drawer, keep the selected table/list visible:

```js
await page.locator(".risk-case-table").scrollIntoViewIfNeeded();
const scrollTop = await page.evaluate(() => document.querySelector(".risk-scroll-area").scrollTop);
await page.locator('[data-context="c-red"]').click();
await page.waitForSelector(".drawer");
await page.evaluate((value) => {
  const scroller = document.querySelector(".risk-scroll-area");
  if (scroller) scroller.scrollTop = value;
}, scrollTop);
```

The video should show the clicked row/list on the left and the opened context on the right.

## Composition

Two-step composition is stable:

```bash
ffmpeg -y -i raw.webm \
  -vf "format=yuv420p" \
  -c:v libx264 -preset medium -crf 20 \
  -movflags +faststart silent.mp4

ffmpeg -y -i silent.mp4 -i voiceover.mp3 \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k \
  -shortest -movflags +faststart final.mp4
```

Measure and log:

- audio duration
- audio delay, if `output.audioDelayMs` is used
- target end
- source webm path
- final MP4 path and bytes

Do not add an ffmpeg audio delay outside the manifest. If a delay is needed, put it in `output.audioDelayMs` so both the recorder and `verify-sync.mjs` use the same timeline.

## Captions

If burned-in subtitles are required, either:

- render a browser caption layer during recording, or
- burn SRT with ffmpeg after composition.

Keep external SRT and pure transcript even when burning captions into video.
