#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import path from "node:path";

const [manifestPath = "scene-plan.json"] = process.argv.slice(2);

function resolveFrom(root, file) {
  return file ? path.resolve(root, file) : "";
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

function replaceTokens(template, values) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown voice command token: {${key}}`);
    return values[key];
  });
}

const manifestRoot = path.dirname(path.resolve(manifestPath));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const voice = {
  mode: "edge-tts",
  voice: "zh-CN-YunjianNeural",
  rate: "+4%",
  pitch: "-2Hz",
  volume: "+8%",
  ...(manifest.voice || {})
};

const narrationFile = resolveFrom(manifestRoot, voice.narration || "dist/voiceover/narration.txt");
const rawAudio = resolveFrom(manifestRoot, voice.rawAudio || "dist/voiceover/voiceover-raw.mp3");
const finalAudio = resolveFrom(manifestRoot, manifest.output?.voiceover || voice.finalAudio || "dist/voiceover/voiceover-enhanced.mp3");
const srtFile = resolveFrom(manifestRoot, manifest.output?.srt || voice.srt || "dist/voiceover/subtitles.srt");
const referenceAudio = resolveFrom(manifestRoot, voice.referenceAudio || "");
const narrationText = (manifest.scenes || []).map((scene) => scene.narration).filter(Boolean).join("\n\n");

if (!narrationText && !existsSync(narrationFile)) {
  throw new Error("No narration found. Add scene.narration values or voice.narration.");
}

await mkdir(path.dirname(narrationFile), { recursive: true });
await mkdir(path.dirname(rawAudio), { recursive: true });
await mkdir(path.dirname(finalAudio), { recursive: true });
await mkdir(path.dirname(srtFile), { recursive: true });
if (narrationText) await writeFile(narrationFile, `${narrationText}\n`);

if (voice.mode === "provided") {
  const missing = [finalAudio, srtFile].filter((file) => !existsSync(file));
  if (missing.length) throw new Error(`Provided voice mode requires existing files: ${missing.join(", ")}`);
  console.log(JSON.stringify({ ok: true, mode: voice.mode, finalAudio, srtFile }, null, 2));
  process.exit(0);
}

if (voice.mode === "reference") {
  if (!referenceAudio || !existsSync(referenceAudio)) {
    throw new Error("Reference voice mode requires voice.referenceAudio.");
  }
  const commandTemplate = voice.cloneCommand || process.env.VOICE_CLONE_COMMAND;
  if (!commandTemplate) {
    throw new Error("Reference voice mode requires voice.cloneCommand or VOICE_CLONE_COMMAND. The command must generate the final audio and SRT from the reference file.");
  }
  const command = replaceTokens(commandTemplate, {
    narration: JSON.stringify(narrationFile),
    referenceAudio: JSON.stringify(referenceAudio),
    rawAudio: JSON.stringify(rawAudio),
    finalAudio: JSON.stringify(finalAudio),
    srt: JSON.stringify(srtFile)
  });
  execSync(command, { stdio: "inherit", shell: true });
  if (!existsSync(finalAudio) || !existsSync(srtFile)) {
    throw new Error("Reference voice command completed, but final audio or SRT is missing.");
  }
  console.log(JSON.stringify({ ok: true, mode: voice.mode, referenceAudio, finalAudio, srtFile }, null, 2));
  process.exit(0);
}

if (voice.mode !== "edge-tts") {
  throw new Error(`Unsupported voice.mode: ${voice.mode}`);
}

if (!commandExists("edge-tts")) {
  throw new Error("edge-tts is not installed. Install it or set voice.mode to provided/reference with ready audio and SRT files.");
}

execFileSync("edge-tts", [
  "-f", narrationFile,
  "-v", voice.voice,
  "--rate", voice.rate,
  "--pitch", voice.pitch,
  "--volume", voice.volume,
  "--write-media", rawAudio,
  "--write-subtitles", srtFile
], { stdio: "inherit" });

execFileSync("ffmpeg", [
  "-y",
  "-i", rawAudio,
  "-af", voice.enhanceFilter || "highpass=f=70,acompressor=threshold=-18dB:ratio=2.2:attack=18:release=180,loudnorm=I=-16:TP=-1.5:LRA=9",
  "-c:a", "libmp3lame",
  "-b:a", voice.bitrate || "128k",
  finalAudio
], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  mode: voice.mode,
  voice: voice.voice,
  rate: voice.rate,
  pitch: voice.pitch,
  volume: voice.volume,
  narrationFile,
  rawAudio,
  finalAudio,
  srtFile
}, null, 2));
