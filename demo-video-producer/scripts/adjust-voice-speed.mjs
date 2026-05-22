#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [inputAudio, outputAudio, factorRaw, inputSrt, outputSrt] = process.argv.slice(2);

if (!inputAudio || !outputAudio || !factorRaw) {
  console.error("Usage: adjust-voice-speed.mjs <input-audio> <output-audio> <factor> [input.srt] [output.srt]");
  process.exit(2);
}

const factor = Number(factorRaw);
if (!Number.isFinite(factor) || factor <= 0) {
  throw new Error(`Invalid speed factor: ${factorRaw}`);
}

function atempoChain(value) {
  const filters = [];
  let remaining = value;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`);
  return filters.join(",");
}

function parseSrtTime(value) {
  const [hours, minutes, rest] = value.trim().split(":");
  const [seconds, millis] = rest.split(",");
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1_000 + Number(millis);
}

function formatSrtTime(msRaw) {
  const ms = Math.max(0, Math.round(msRaw));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

execFileSync("ffmpeg", [
  "-y",
  "-i", inputAudio,
  "-filter:a", atempoChain(factor),
  "-vn",
  outputAudio
], { stdio: "inherit" });

if (inputSrt && outputSrt) {
  const text = readFileSync(inputSrt, "utf8").replace(
    /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/g,
    (_, start, end) => `${formatSrtTime(parseSrtTime(start) / factor)} --> ${formatSrtTime(parseSrtTime(end) / factor)}`
  );
  writeFileSync(outputSrt, text);
}

console.log(JSON.stringify({ ok: true, inputAudio, outputAudio, factor, inputSrt: inputSrt || null, outputSrt: outputSrt || null }, null, 2));
