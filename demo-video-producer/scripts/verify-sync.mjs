#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const [manifestPath = "scene-plan.json", runLogPathArg, finalVideoArg] = process.argv.slice(2);

if (!existsSync(manifestPath)) {
  console.error("Usage: verify-sync.mjs <scene-plan.json> [run-log.json] [final.mp4]");
  process.exit(2);
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

function durationMs(file) {
  if (!file || !existsSync(file)) return 0;
  const stdout = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file
  ], { encoding: "utf8" });
  return Math.round(Number(stdout.trim()) * 1000);
}

function buildSceneTiming(manifest, cues, audioDelayMs) {
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

function defaultRunLogPath(root, manifest) {
  if (manifest.output?.runLog) return path.resolve(root, manifest.output.runLog);
  if (manifest.output?.video) return path.resolve(root, manifest.output.video).replace(/\.mp4$/i, ".run-log.json");
  return "";
}

const manifestRoot = path.dirname(path.resolve(manifestPath));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors = [];
const warnings = [];
function readNonNegativeMs(value, field, fallback = 0) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${field} must be a non-negative number of milliseconds`);
    return fallback;
  }
  return Math.round(number);
}
function readRunLogMs(value, field, required = true) {
  if (value == null) {
    if (required) errors.push(`${field} is missing`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${field} must be a non-negative number of milliseconds`);
    return null;
  }
  return Math.round(number);
}
function canonicalPath(file) {
  if (!file) return "";
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}
const defaultSyncPolicy = {
  startToleranceMs: 700,
  visibleToleranceMs: 1200,
  endToleranceMs: 1800,
  maxAudioSrtDriftMs: 1500,
  maxFinalDurationDriftMs: 2500
};
const syncPolicy = { ...defaultSyncPolicy };
for (const field of Object.keys(defaultSyncPolicy)) {
  if (Object.hasOwn(manifest.sync || {}, field)) {
    syncPolicy[field] = readNonNegativeMs(manifest.sync[field], `sync.${field}`, defaultSyncPolicy[field]);
  }
}
const audioDelayMs = readNonNegativeMs(manifest.output?.audioDelayMs, "output.audioDelayMs");
const srtFile = manifest.output?.srt ? path.resolve(manifestRoot, manifest.output.srt) : "";
const audioFile = manifest.output?.voiceover ? path.resolve(manifestRoot, manifest.output.voiceover) : "";
const finalVideo = finalVideoArg || (manifest.output?.video ? path.resolve(manifestRoot, manifest.output.video) : "");
const runLogPath = runLogPathArg || defaultRunLogPath(manifestRoot, manifest);

if (!existsSync(srtFile)) errors.push(`missing srt: ${srtFile}`);
if (!existsSync(runLogPath)) errors.push(`missing run log: ${runLogPath}`);
if (manifest.allowSilent === true || manifest.output?.allowSilent === true) {
  errors.push("allowSilent is not supported by this delivery workflow; provide output.voiceover and output.srt");
}
if (!audioFile) errors.push("missing output.voiceover; sync verification requires the narration audio");
if (audioFile && !existsSync(audioFile)) errors.push(`missing voiceover: ${audioFile}`);
if (!finalVideo) errors.push("missing output.video or final video argument");
if (finalVideo && !existsSync(finalVideo)) errors.push(`missing final video: ${finalVideo}`);

const cues = readSrtCues(srtFile);
const timing = buildSceneTiming(manifest, cues, audioDelayMs);
const runLog = existsSync(runLogPath) ? JSON.parse(readFileSync(runLogPath, "utf8")) : { scenes: [] };
const sceneLogs = new Map((runLog.scenes || []).map((scene) => [scene.id, scene]));

if (existsSync(runLogPath)) {
  if (runLog.status !== "complete") {
    errors.push(`run log status must be complete; got ${runLog.status || "missing"}`);
  }
  if (!runLog.output) {
    errors.push("run log missing output path");
  } else if (finalVideo && canonicalPath(runLog.output) !== canonicalPath(finalVideo)) {
    errors.push(`run log output ${runLog.output} does not match final video ${finalVideo}`);
  }
  if (!runLog.manifest) {
    errors.push("run log missing manifest path");
  } else if (canonicalPath(runLog.manifest) !== canonicalPath(manifestPath)) {
    errors.push(`run log manifest ${runLog.manifest} does not match ${path.resolve(manifestPath)}`);
  }
}

if (cues.length && timing.size !== (manifest.scenes || []).length) {
  errors.push(`only ${timing.size}/${(manifest.scenes || []).length} scenes have SRT timing; add cueRange or one cue per scene`);
}

for (const scene of manifest.scenes || []) {
  const target = timing.get(scene.id);
  const actual = sceneLogs.get(scene.id);
  if (!target) {
    errors.push(`scene ${scene.id}: missing subtitle timing`);
    continue;
  }
  if (!actual) {
    errors.push(`scene ${scene.id}: missing run-log entry`);
    continue;
  }

  const actualStartMs = readRunLogMs(actual.actualStartMs, `scene ${scene.id}: actualStartMs`);
  const checksDoneMs = readRunLogMs(actual.checksDoneMs, `scene ${scene.id}: checksDoneMs`);
  const actualEndMs = readRunLogMs(actual.actualEndMs, `scene ${scene.id}: actualEndMs`, false);

  if (actualStartMs != null) {
    const startDrift = Math.abs(actualStartMs - target.startMs);
    if (startDrift > syncPolicy.startToleranceMs) {
      errors.push(`scene ${scene.id}: start drift ${startDrift}ms exceeds ${syncPolicy.startToleranceMs}ms`);
    }
  }

  if (checksDoneMs != null) {
    const visibleLateBy = checksDoneMs - target.endMs;
    if (visibleLateBy > syncPolicy.visibleToleranceMs) {
      errors.push(`scene ${scene.id}: UI checks completed ${visibleLateBy}ms after narration cue ended`);
    }
  }

  if (actualEndMs != null) {
    const allowedEnd = target.endMs + (scene.postHoldMs ?? 550) + syncPolicy.endToleranceMs;
    if (actualEndMs > allowedEnd) {
      warnings.push(`scene ${scene.id}: scene ended ${actualEndMs - allowedEnd}ms beyond expected hold`);
    }
  }
}

const audioMs = durationMs(audioFile);
const finalVideoMs = durationMs(finalVideo);
const srtEndMs = cues.at(-1)?.endMs || 0;
const effectiveAudioMs = audioMs ? audioMs + audioDelayMs : 0;

if (audioFile && existsSync(audioFile) && audioMs < 1) {
  errors.push(`invalid voiceover duration: ${audioMs}ms`);
}
if (finalVideo && existsSync(finalVideo) && finalVideoMs < 1) {
  errors.push(`invalid final video duration: ${finalVideoMs}ms`);
}

if (audioMs && srtEndMs) {
  const drift = Math.abs(audioMs - srtEndMs);
  if (drift > syncPolicy.maxAudioSrtDriftMs) {
    errors.push(`audio/SRT drift ${drift}ms exceeds ${syncPolicy.maxAudioSrtDriftMs}ms`);
  }
}

if (finalVideoMs && effectiveAudioMs) {
  const drift = Math.abs(finalVideoMs - effectiveAudioMs);
  if (drift > syncPolicy.maxFinalDurationDriftMs) {
    errors.push(`final video/audio duration drift ${drift}ms exceeds ${syncPolicy.maxFinalDurationDriftMs}ms`);
  }
}

const result = {
  ok: errors.length === 0,
  manifest: path.resolve(manifestPath),
  runLog: runLogPath,
  scenes: (manifest.scenes || []).length,
  timedScenes: timing.size,
  srtCues: cues.length,
  audioMs,
  audioDelayMs,
  effectiveAudioMs,
  srtEndMs,
  finalVideoMs,
  policy: syncPolicy,
  errors,
  warnings
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
