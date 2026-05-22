#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

const [manifestPath = "scene-plan.json", finalVideoArg] = process.argv.slice(2);

function parseSrtTime(value) {
  const [hours, minutes, rest] = value.trim().split(":");
  const [seconds, millis] = rest.split(",");
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1_000 + Number(millis);
}

function readSrtCues(file) {
  if (!file || !existsSync(file)) return [];
  const raw = readFileSync(file, "utf8").trim();
  if (!raw) return [];
  return raw.split(/\n\s*\n/).map((block) => {
    const timingLine = block.split(/\r?\n/).find((line) => line.includes("-->"));
    if (!timingLine) return null;
    const [start, end] = timingLine.split("-->").map((item) => item.trim());
    return { startMs: parseSrtTime(start), endMs: parseSrtTime(end) };
  }).filter(Boolean);
}

function durationMs(file) {
  const stdout = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file
  ], { encoding: "utf8" });
  return Math.round(Number(stdout.trim()) * 1000);
}

const root = path.dirname(path.resolve(manifestPath));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const finalVideo = finalVideoArg || path.resolve(root, manifest.output.video);
const srt = manifest.output?.srt ? path.resolve(root, manifest.output.srt) : "";
const outputDir = path.resolve(root, manifest.output?.visualCheckDir || "dist/video-checks");
const maxFrames = Math.min(Number(manifest.checks?.maxFrames || 6), 10);

if (!existsSync(finalVideo)) throw new Error(`Missing final video: ${finalVideo}`);
const cues = readSrtCues(srt);
const scenes = manifest.scenes || [];
const selected = scenes
  .filter((scene) => scene.checkpoint)
  .slice(0, maxFrames);

while (selected.length < Math.min(maxFrames, scenes.length)) {
  const index = Math.floor((selected.length / Math.max(1, Math.min(maxFrames, scenes.length) - 1)) * (scenes.length - 1));
  const scene = scenes[index];
  if (scene && !selected.some((item) => item.id === scene.id)) selected.push(scene);
  if (selected.length >= scenes.length) break;
}

const videoMs = durationMs(finalVideo);
await mkdir(outputDir, { recursive: true });
const frames = [];

for (const [index, scene] of selected.entries()) {
  let ms = Math.round((videoMs / Math.max(1, selected.length + 1)) * (index + 1));
  if (Array.isArray(scene.cueRange) && cues.length) {
    const cue = cues[scene.cueRange[0] - 1];
    if (cue) ms = cue.startMs + 800;
  }
  ms = Math.min(Math.max(ms, 0), Math.max(0, videoMs - 500));
  const out = path.join(outputDir, `${String(index + 1).padStart(2, "0")}-${scene.id || "frame"}.jpg`);
  execFileSync("ffmpeg", [
    "-y",
    "-ss", (ms / 1000).toFixed(3),
    "-i", finalVideo,
    "-frames:v", "1",
    "-q:v", "2",
    out
  ], { stdio: "ignore" });
  frames.push({ scene: scene.id, ms, file: out });
}

console.log(JSON.stringify({ ok: true, finalVideo, outputDir, frames, maxFrames }, null, 2));
