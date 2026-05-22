#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const [manifestPath = "scene-plan.json"] = process.argv.slice(2);

if (!existsSync(manifestPath)) {
  console.error("Usage: validate-scene-plan.mjs <scene-plan.json>");
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
    .trim()
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

function mediaDurationMs(file) {
  if (!file || !existsSync(file)) return 0;
  const stdout = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file
  ], { encoding: "utf8" });
  return Math.round(Number(stdout.trim()) * 1000);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function stripJsComments(source) {
  let output = "";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      output += " ";
      continue;
    }
    output += char;
  }
  return output;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevelProperties(body) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") depth += 1;
    if (char === "}" || char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

function extractActionNamesFromObjectBody(body) {
  const names = new Set();
  for (const rawPart of splitTopLevelProperties(body)) {
    const part = rawPart.trim();
    if (!part || part.startsWith("...") || part.startsWith("[")) continue;
    let match = part.match(/^["']([^"']+)["']\s*:\s*([\s\S]+)$/);
    if (match) {
      if (isFunctionLikeActionValue(match[2])) names.add(match[1]);
      continue;
    }
    match = part.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
    if (match) {
      if (isFunctionLikeActionValue(match[2])) names.add(match[1]);
      continue;
    }
    match = part.match(/^async\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (match) {
      names.add(match[1]);
      continue;
    }
    match = part.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (match) {
      names.add(match[1]);
      continue;
    }
    match = part.match(/^([A-Za-z_$][\w$]*)$/);
    if (match) names.add(match[1]);
  }
  return names;
}

function isFunctionLikeActionValue(value) {
  const text = value.trim();
  if (["true", "false", "null", "undefined", "NaN", "Infinity"].includes(text)) return false;
  return /^(async\s+)?function\b/.test(text)
    || /^(async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(text)
    || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(text);
}

function readObjectNamesAt(source, openIndex) {
  const closeIndex = findMatchingBrace(source, openIndex);
  if (closeIndex < 0) return new Set();
  return extractActionNamesFromObjectBody(source.slice(openIndex + 1, closeIndex));
}

function findNamedObjectLiteral(source, name) {
  const pattern = new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=\\s*{`);
  const match = pattern.exec(source);
  if (!match) return new Set();
  return readObjectNamesAt(source, match.index + match[0].lastIndexOf("{"));
}

function readCustomActionNames(file) {
  if (!file || !existsSync(file)) return new Set();
  const source = stripJsComments(readFileSync(file, "utf8"));
  const names = new Set();
  const defaultObject = /export\s+default\s*{/.exec(source);
  if (defaultObject) {
    for (const name of readObjectNamesAt(source, defaultObject.index + defaultObject[0].lastIndexOf("{"))) {
      names.add(name);
    }
  }
  for (const name of findNamedObjectLiteral(source, "actions")) names.add(name);
  const defaultIdentifier = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/.exec(source);
  if (defaultIdentifier) {
    for (const name of findNamedObjectLiteral(source, defaultIdentifier[1])) names.add(name);
  }
  return names;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const root = path.dirname(path.resolve(manifestPath));
const resolveMaybe = (file) => file ? path.resolve(root, file) : "";
const errors = [];
const warnings = [];
function readNonNegativeMs(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${field} must be a non-negative number of milliseconds`);
    return 0;
  }
  return Math.round(number);
}
const supportedActions = new Set([
  "goto",
  "switchPage",
  "waitText",
  "waitGone",
  "clickText",
  "clickSelector",
  "typeAndSend",
  "scrollIntoView",
  "scrollModule",
  "openDrawer",
  "hold"
]);
const supportedChecks = new Set(["visibleText", "visibleSelector", "hiddenSelector"]);
const customActionsFile = resolveMaybe(manifest.customActions);
const customActionNames = readCustomActionNames(customActionsFile);
const audioDelayMs = readNonNegativeMs(manifest.output?.audioDelayMs, "output.audioDelayMs");
const syncFields = [
  "startToleranceMs",
  "visibleToleranceMs",
  "endToleranceMs",
  "maxAudioSrtDriftMs",
  "maxFinalDurationDriftMs"
];
for (const field of syncFields) {
  if (Object.hasOwn(manifest.sync || {}, field)) {
    readNonNegativeMs(manifest.sync[field], `sync.${field}`);
  }
}

const scenes = asArray(manifest.scenes);
if (!manifest.project) errors.push("missing project");
if (!scenes.length) errors.push("missing scenes[]");
if (!manifest.output?.video) errors.push("missing output.video");
if (manifest.output?.video && !/\.mp4$/i.test(manifest.output.video)) {
  warnings.push("output.video should be an .mp4 file for customer delivery");
}
if (manifest.output?.voiceover && !manifest.output?.srt) {
  errors.push("output.voiceover is declared but output.srt is missing");
}
if (manifest.allowSilent === true || manifest.output?.allowSilent === true) {
  errors.push("allowSilent is not supported by this delivery workflow; provide output.voiceover and output.srt");
}
if (!manifest.output?.voiceover) errors.push("missing output.voiceover");
if (!manifest.output?.srt) errors.push("missing output.srt");
if (manifest.customActions && !existsSync(customActionsFile)) {
  errors.push(`missing customActions file: ${manifest.customActions}`);
}

const services = asArray(manifest.services);
const serviceIds = new Set();
for (const [index, service] of services.entries()) {
  const prefix = `service[${index}]${service?.id ? ` (${service.id})` : ""}`;
  if (!service?.id) errors.push(`${prefix}: missing id`);
  if (service?.id && serviceIds.has(service.id)) errors.push(`${prefix}: duplicate id`);
  if (service?.id) serviceIds.add(service.id);
  if (!service?.url) errors.push(`${prefix}: missing url`);
}

const ids = new Set();
for (const [index, scene] of scenes.entries()) {
  const prefix = `scene[${index}]${scene?.id ? ` (${scene.id})` : ""}`;
  if (!scene?.id) errors.push(`${prefix}: missing id`);
  if (scene?.id && ids.has(scene.id)) errors.push(`${prefix}: duplicate id`);
  if (scene?.id) ids.add(scene.id);
  if (!scene?.page) errors.push(`${prefix}: missing page`);
  if (!scene?.narration) errors.push(`${prefix}: missing narration`);
  if (!asArray(scene?.actions).length && !scene?.allowPassive) errors.push(`${prefix}: no actions[]; set allowPassive=true only for intentional hold-only scenes`);
  if (!asArray(scene?.checks).length && !scene?.allowPassive) errors.push(`${prefix}: no checks[]; add a visible/hidden assertion for stable recording`);
  if (scene?.minHoldMs && (scene.minHoldMs < 0 || scene.minHoldMs > 15000)) {
    warnings.push(`${prefix}: minHoldMs is unusual; prefer subtitle-derived timing`);
  }
  for (const [actionIndex, action] of asArray(scene?.actions).entries()) {
    const actionPrefix = `${prefix}.actions[${actionIndex}]`;
    if (!action?.type) {
      errors.push(`${actionPrefix}: missing type`);
      continue;
    }
    if (!supportedActions.has(action.type) && !manifest.customActions) {
      errors.push(`${actionPrefix}: unsupported type ${action.type}`);
    } else if (!supportedActions.has(action.type)) {
      if (!customActionNames.has(action.type)) {
        errors.push(`${actionPrefix}: custom action ${action.type} is not statically declared as a function-like export in ${manifest.customActions}`);
      }
    }
    if ((action.type === "goto" || action.type === "switchPage") && !(action.service || action.page)) {
      errors.push(`${actionPrefix}: ${action.type} requires service or page`);
    }
    if ((action.type === "waitText" || action.type === "clickText" || action.type === "typeAndSend") && !action.text) {
      errors.push(`${actionPrefix}: ${action.type} requires text`);
    }
    if (action.type === "waitGone" && !(action.selector || action.text)) {
      errors.push(`${actionPrefix}: waitGone requires selector or text`);
    }
    if ((action.type === "clickSelector" || action.type === "scrollIntoView" || action.type === "scrollModule") && !action.selector) {
      errors.push(`${actionPrefix}: ${action.type} requires selector`);
    }
    if (action.type === "openDrawer") {
      if (!(action.selector || action.text)) errors.push(`${actionPrefix}: openDrawer requires selector or text`);
      if (!(action.waitSelector || action.waitText)) warnings.push(`${actionPrefix}: openDrawer should wait for drawer selector or text`);
    }
  }
  for (const [checkIndex, check] of asArray(scene?.checks).entries()) {
    const checkPrefix = `${prefix}.checks[${checkIndex}]`;
    if (!check?.type) {
      errors.push(`${checkPrefix}: missing type`);
      continue;
    }
    if (!supportedChecks.has(check.type)) errors.push(`${checkPrefix}: unsupported type ${check.type}`);
    if (check.type === "visibleText" && !check.text) errors.push(`${checkPrefix}: visibleText requires text`);
    if ((check.type === "visibleSelector" || check.type === "hiddenSelector") && !check.selector) {
      errors.push(`${checkPrefix}: ${check.type} requires selector`);
    }
  }
  if (scene?.cueRange) {
    if (!Array.isArray(scene.cueRange) || scene.cueRange.length !== 2) {
      errors.push(`${prefix}: cueRange must be [startCue, endCue]`);
    }
  }
}

for (const scene of scenes) {
  if (scene?.page && services.length && !services.some((service) => service.id === scene.page)) {
    errors.push(`scene (${scene.id}) references unknown page/service: ${scene.page}`);
  }
}

const srtFile = resolveMaybe(manifest.output?.srt);
const audioFile = resolveMaybe(manifest.output?.voiceover);
const cues = readSrtCues(srtFile);
const audioMs = mediaDurationMs(audioFile);

if (manifest.voice?.mode === "reference" && !manifest.voice?.referenceAudio) {
  errors.push("voice.mode reference requires voice.referenceAudio");
}
if (manifest.voice?.mode === "provided" && (!manifest.output?.voiceover || !manifest.output?.srt)) {
  errors.push("voice.mode provided requires output.voiceover and output.srt");
}

if (manifest.output?.srt && !existsSync(srtFile)) errors.push(`missing srt: ${manifest.output.srt}`);
if (manifest.output?.voiceover && !existsSync(audioFile)) errors.push(`missing voiceover: ${manifest.output.voiceover}`);
if (cues.length) {
  const lastCueMs = cues.at(-1).endMs;
  const driftMs = audioMs ? Math.abs(audioMs - lastCueMs) : 0;
  if (audioMs && driftMs > 1500) {
    errors.push(`audio/SRT duration drift ${driftMs}ms exceeds 1500ms`);
  }
  if (cues.length !== scenes.length) {
    const missingCueRange = scenes.filter((scene) => !Array.isArray(scene?.cueRange));
    if (missingCueRange.length) {
      const ids = missingCueRange.map((scene) => scene?.id || "unnamed").join(", ");
      errors.push(`SRT cue count ${cues.length} differs from scene count ${scenes.length}; add cueRange to scenes without one: ${ids}`);
    }
  }
  for (const scene of scenes) {
    if (!scene?.cueRange) continue;
    const [startCue, endCue] = scene.cueRange;
    if (startCue < 1 || endCue < startCue || endCue > cues.length) {
      errors.push(`scene (${scene.id}) cueRange [${startCue}, ${endCue}] outside SRT cue count ${cues.length}`);
    }
  }
}

const result = {
  manifest: manifestPath,
  ok: errors.length === 0,
  scenes: scenes.length,
  services: services.length,
  srtCues: cues.length,
  audioMs,
  audioDelayMs,
  errors,
  warnings
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
