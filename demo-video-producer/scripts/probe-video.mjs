#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const [input = "scene-plan.json"] = process.argv.slice(2);

function resolveInput(value) {
  if (/\.json$/i.test(value)) {
    if (!existsSync(value)) return "";
    const manifest = JSON.parse(readFileSync(value, "utf8"));
    if (!manifest.output?.video) return "";
    return path.resolve(path.dirname(path.resolve(value)), manifest.output.video);
  }
  return value;
}

const file = resolveInput(input);

if (!file) {
  console.error("Usage: probe-video.mjs <final.mp4|scene-plan.json>");
  process.exit(2);
}

if (!existsSync(file)) {
  console.error(`Missing file: ${file}`);
  process.exit(1);
}

const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration,size:stream=index,codec_type,codec_name,width,height,duration",
  "-of", "json",
  file
], { encoding: "utf8" }));

const streams = probe.streams || [];
const video = streams.find((stream) => stream.codec_type === "video");
const audio = streams.find((stream) => stream.codec_type === "audio");
const duration = Number(probe.format?.duration || 0);
const size = statSync(file).size;

const errors = [];
if (!video) errors.push("missing video stream");
if (!audio) errors.push("missing audio stream");
if (!duration || duration < 1) errors.push("invalid duration");
if (!size || size < 10_000) errors.push("file too small");

const result = {
  file,
  ok: errors.length === 0,
  durationSeconds: Number(duration.toFixed(3)),
  sizeBytes: size,
  video: video ? {
    codec: video.codec_name,
    width: video.width,
    height: video.height
  } : null,
  audio: audio ? {
    codec: audio.codec_name
  } : null,
  errors
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
