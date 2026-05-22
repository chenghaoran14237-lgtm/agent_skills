#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
const scriptRequire = createRequire(import.meta.url);
const { chromium } = loadPlaywright();

const root = process.cwd();
const manifestFile = process.env.SCENE_PLAN || process.argv[2] || "scene-plan.json";
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const manifestRoot = path.dirname(path.resolve(manifestFile));
const viewport = manifest.viewport || { width: 1440, height: 900 };
const captureDir = path.resolve(root, manifest.output?.captureDir || ".video-recording");
const outputVideo = path.resolve(manifestRoot, manifest.output.video);
const voiceoverAudio = manifest.output?.voiceover ? path.resolve(manifestRoot, manifest.output.voiceover) : "";
const srtFile = manifest.output?.srt ? path.resolve(manifestRoot, manifest.output.srt) : "";
const runLogFile = path.resolve(manifestRoot, manifest.output?.runLog || outputVideo.replace(/\.mp4$/i, ".run-log.json"));
const audioDelayMs = readNonNegativeMs(manifest.output?.audioDelayMs, "output.audioDelayMs");
const sceneTiming = buildSceneTiming();
const customActionsFile = manifest.customActions ? path.resolve(manifestRoot, manifest.customActions) : "";

const runLog = {
  manifest: path.resolve(manifestFile),
  outputVideo,
  voiceoverAudio,
  srtFile,
  audioDelayMs,
  viewport,
  startedAt: new Date().toISOString(),
  scenes: [],
  errors: []
};

let customActions = {};

function loadPlaywright() {
  const explicitPath = process.env.PLAYWRIGHT_PATH;
  if (explicitPath) {
    try {
      return projectRequire(path.resolve(explicitPath));
    } catch {
      // Fall through to normal module resolution.
    }
  }

  try {
    const resolved = projectRequire.resolve("playwright", {
      paths: [
        process.cwd(),
        ...String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
      ]
    });
    return projectRequire(resolved);
  } catch {
    try {
      return scriptRequire("playwright");
    } catch {
      throw new Error("Cannot find Playwright. Install it with `npm install -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_PATH.");
    }
  }
}

function readNonNegativeMs(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${field} must be a non-negative number of milliseconds`);
  }
  return Math.round(number);
}

function service(id) {
  const item = (manifest.services || []).find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown service: ${id}`);
  return item;
}

async function writeRunLog(extra = {}) {
  await mkdir(path.dirname(runLogFile), { recursive: true });
  await writeFile(runLogFile, `${JSON.stringify({ ...runLog, ...extra }, null, 2)}\n`);
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(startEpochMs, targetMs) {
  const remaining = targetMs - (Date.now() - startEpochMs);
  if (remaining > 0) await wait(remaining);
}

async function waitForText(page, text, timeout = 12000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

function parseSrtTime(value) {
  const [hours, minutes, rest] = value.trim().split(":");
  const [seconds, millis] = rest.split(",");
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1_000 + Number(millis);
}

function readSrtCues(file) {
  if (!file || !existsSync(file)) return [];
  const raw = readFileSync(file, "utf8").trim();
  if (!raw) return [];
  return raw
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const timingLine = lines.find((line) => line.includes("-->"));
      if (!timingLine) return null;
      const [start, end] = timingLine.split("-->").map((item) => item.trim());
      return {
        startMs: parseSrtTime(start),
        endMs: parseSrtTime(end),
        text: lines.slice(lines.indexOf(timingLine) + 1).join("\n")
      };
    })
    .filter(Boolean);
}

function buildSceneTiming() {
  const cues = readSrtCues(srtFile);
  if (!cues.length) return new Map();
  const timing = new Map();
  for (const [index, scene] of (manifest.scenes || []).entries()) {
    let startCue;
    let endCue;
    if (Array.isArray(scene.cueRange)) {
      [startCue, endCue] = scene.cueRange;
    } else if (cues.length === manifest.scenes.length) {
      startCue = index + 1;
      endCue = index + 1;
    } else {
      continue;
    }
    const start = cues[startCue - 1];
    const end = cues[endCue - 1];
    if (start && end) {
      timing.set(scene.id, {
        startCue,
        endCue,
        startMs: start.startMs + audioDelayMs,
        endMs: end.endMs + audioDelayMs
      });
    }
  }
  return timing;
}

async function loadCustomActions() {
  if (!customActionsFile) return;
  if (!existsSync(customActionsFile)) throw new Error(`customActions file not found: ${customActionsFile}`);
  const module = await import(pathToFileUrl(customActionsFile));
  customActions = module.default || module.actions || {};
}

function pathToFileUrl(file) {
  return pathToFileURL(path.resolve(file)).href;
}

async function typeAndSend(page, selector, text) {
  const input = page.locator(selector);
  await input.waitFor({ state: "visible", timeout: 10000 });
  await input.fill("");
  await input.type(text, { delay: text.length <= 2 ? 120 : 42 });
  await wait(text.length <= 2 ? 420 : 650);
  await page.keyboard.press("Enter");
}

async function runAction(page, action, scene) {
  if (customActions[action.type]) {
    await customActions[action.type]({ page, action, scene, manifest, wait, waitForText });
    return;
  }

  if (action.type === "goto") {
    const target = service(action.service);
    await page.goto(target.url, { waitUntil: action.waitUntil || "networkidle" });
    if (target.requiredText) await waitForText(page, target.requiredText, action.timeout || 12000);
    return;
  }

  if (action.type === "switchPage") {
    const target = service(action.service || action.page);
    await page.goto(target.url, { waitUntil: action.waitUntil || "networkidle" });
    if (target.requiredText) await waitForText(page, target.requiredText, action.timeout || 12000);
    return;
  }

  if (action.type === "waitText") {
    await waitForText(page, action.text, action.timeout || 12000);
    return;
  }

  if (action.type === "waitGone") {
    if (action.selector) {
      await page.locator(action.selector).first().waitFor({ state: "hidden", timeout: action.timeout || 12000 });
      return;
    }
    if (action.text) {
      await page.getByText(action.text, { exact: action.exact ?? false }).first().waitFor({ state: "hidden", timeout: action.timeout || 12000 });
      return;
    }
    throw new Error("waitGone requires selector or text");
  }

  if (action.type === "clickText") {
    await page.getByText(action.text, { exact: action.exact ?? true }).first().click();
    return;
  }

  if (action.type === "clickSelector") {
    await page.locator(action.selector).first().click();
    return;
  }

  if (action.type === "openDrawer") {
    const trigger = action.selector
      ? page.locator(action.selector).first()
      : page.getByText(action.text, { exact: action.exact ?? true }).first();
    await trigger.click();
    if (action.waitSelector) {
      await page.locator(action.waitSelector).first().waitFor({ state: "visible", timeout: action.timeout || 12000 });
    }
    if (action.waitText) await waitForText(page, action.waitText, action.timeout || 12000);
    return;
  }

  if (action.type === "typeAndSend") {
    await typeAndSend(page, action.selector || "#assistantInput", action.text);
    return;
  }

  if (action.type === "scrollIntoView") {
    await page.locator(action.selector).first().scrollIntoViewIfNeeded();
    return;
  }

  if (action.type === "scrollModule") {
    await page.locator(action.selector).first().evaluate((node, value) => {
      node.scrollTop = value;
    }, action.top || 0);
    return;
  }

  if (action.type === "hold") {
    await wait(action.ms || 800);
    return;
  }

  throw new Error(`Unsupported action type: ${action.type}`);
}

async function runCheck(page, check) {
  if (check.type === "visibleText") {
    await waitForText(page, check.text, check.timeout || 12000);
    return;
  }

  if (check.type === "visibleSelector") {
    await page.locator(check.selector).first().waitFor({ state: "visible", timeout: check.timeout || 12000 });
    return;
  }

  if (check.type === "hiddenSelector") {
    await page.locator(check.selector).first().waitFor({ state: "hidden", timeout: check.timeout || 12000 });
    return;
  }

  throw new Error(`Unsupported check type: ${check.type}`);
}

async function convertVideo(sourceWebm) {
  await mkdir(path.dirname(outputVideo), { recursive: true });
  const silentMp4 = outputVideo.replace(/\.mp4$/i, "-silent.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", sourceWebm,
    "-vf", "format=yuv420p",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-movflags", "+faststart",
    silentMp4
  ]);

  if (!voiceoverAudio || !existsSync(voiceoverAudio)) {
    throw new Error("output.voiceover is required and must exist before composing the final MP4");
  }
  const audioInput = audioDelayMs > 0
    ? ["-filter_complex", `[1:a]adelay=${audioDelayMs}|${audioDelayMs}[a]`, "-map", "0:v:0", "-map", "[a]"]
    : ["-map", "0:v:0", "-map", "1:a:0"];

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", silentMp4,
    "-i", voiceoverAudio,
    ...audioInput,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outputVideo
  ]);
  return outputVideo;
}

async function main() {
  if (manifest.allowSilent === true || manifest.output?.allowSilent === true) {
    throw new Error("allowSilent is not supported by this delivery workflow; provide output.voiceover and output.srt");
  }
  if (!voiceoverAudio || !existsSync(voiceoverAudio)) {
    throw new Error("output.voiceover is required and must exist before recording");
  }
  if (!srtFile || !existsSync(srtFile)) {
    throw new Error("output.srt is required and must exist before recording");
  }
  await loadCustomActions();
  await rm(captureDir, { recursive: true, force: true });
  await mkdir(captureDir, { recursive: true });

  const browser = await chromium.launch({ headless: manifest.browser?.headless ?? true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: manifest.browser?.deviceScaleFactor || 1,
    recordVideo: { dir: captureDir, size: viewport }
  });
  const page = await context.newPage();
  const video = page.video();
  const startEpochMs = Date.now();
  runLog.startEpochMs = startEpochMs;

  try {
    for (const scene of manifest.scenes || []) {
      const timing = sceneTiming.get(scene.id);
      if (timing) await until(startEpochMs, timing.startMs);
      const sceneLog = {
        id: scene.id,
        targetStartMs: timing?.startMs ?? null,
        targetEndMs: timing?.endMs ?? null,
        cueRange: Array.isArray(scene.cueRange) ? scene.cueRange : null,
        actualStartMs: Date.now() - startEpochMs,
        actions: [],
        checks: []
      };
      runLog.scenes.push(sceneLog);

      for (const action of scene.actions || []) {
        const actionLog = { type: action.type, startedMs: Date.now() - startEpochMs };
        await runAction(page, action, scene);
        actionLog.endedMs = Date.now() - startEpochMs;
        sceneLog.actions.push(actionLog);
      }
      sceneLog.actionsDoneMs = Date.now() - startEpochMs;

      for (const check of scene.checks || []) {
        const checkLog = { type: check.type, startedMs: Date.now() - startEpochMs };
        await runCheck(page, check);
        checkLog.endedMs = Date.now() - startEpochMs;
        sceneLog.checks.push(checkLog);
      }
      sceneLog.checksDoneMs = Date.now() - startEpochMs;

      if (timing) {
        await until(startEpochMs, timing.endMs + (scene.postHoldMs ?? 550));
      } else {
        await wait(scene.minHoldMs || 700);
      }
      sceneLog.actualEndMs = Date.now() - startEpochMs;
      await writeRunLog({ status: "recording" });
    }
  } catch (error) {
    runLog.errors.push({ message: error.message, stack: error.stack });
    await writeRunLog({ status: "failed" });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  const sourceWebm = await video.path();
  const output = await convertVideo(sourceWebm);
  const stats = await stat(output);
  await writeRunLog({ status: "complete", sourceWebm, output, sizeBytes: stats.size, completedAt: new Date().toISOString() });
  console.log(JSON.stringify({ sourceWebm, output, runLog: runLogFile, sizeBytes: stats.size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
