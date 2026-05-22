#!/usr/bin/env node
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
const scriptRequire = createRequire(import.meta.url);
const errors = [];
const warnings = [];

function commandVersion(command, args = ["-version"]) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .split(/\r?\n/)
      .find(Boolean)
      ?.trim() || "";
  } catch {
    return "";
  }
}

function requireCommand(command, args) {
  const version = commandVersion(command, args);
  if (!version) errors.push(`missing command: ${command}`);
  return version;
}

function optionalCommand(command, args, reason) {
  const version = commandVersion(command, args);
  if (!version) warnings.push(`optional command not found: ${command}; ${reason}`);
  return version;
}

function loadModule(name, installHint) {
  const explicitPath = name === "playwright" ? process.env.PLAYWRIGHT_PATH : "";
  try {
    if (explicitPath && existsSync(explicitPath)) {
      return projectRequire(path.resolve(explicitPath));
    }
    const resolved = projectRequire.resolve(name, {
      paths: [
        process.cwd(),
        ...String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
      ]
    });
    return projectRequire(resolved);
  } catch {
    try {
      return scriptRequire(name);
    } catch {
      errors.push(`missing node module: ${name}; ${installHint}`);
      return null;
    }
  }
}

function checkPlaywright() {
  const mod = loadModule("playwright", "run npm install -D playwright && npx playwright install chromium, or set PLAYWRIGHT_PATH");
  if (!mod) return { loadable: false, chromiumInstalled: false, executablePath: "" };
  let executablePath = "";
  try {
    executablePath = mod.chromium.executablePath();
    if (!existsSync(executablePath)) {
      errors.push("Playwright Chromium browser is not installed; run npx playwright install chromium");
      return { loadable: true, chromiumInstalled: false, executablePath };
    }
  } catch {
    errors.push("Cannot resolve Playwright Chromium executable; run npx playwright install chromium");
    return { loadable: true, chromiumInstalled: false, executablePath };
  }
  return { loadable: true, chromiumInstalled: true, executablePath };
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 18) errors.push(`Node.js 18+ required; current ${process.version}`);
const playwright = checkPlaywright();

const result = {
  ok: false,
  node: process.version,
  ffmpeg: requireCommand("ffmpeg", ["-version"]),
  ffprobe: requireCommand("ffprobe", ["-version"]),
  edgeTts: optionalCommand("edge-tts", ["--version"], "needed only when generating Mandarin voiceover with the bundled example"),
  playwright,
  errors,
  warnings
};

result.ok = errors.length === 0;
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
