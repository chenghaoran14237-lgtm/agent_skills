#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const smokeDir = path.resolve(process.cwd(), ".demo-video-smoke");
const fixture = path.join(skillRoot, "assets/fixtures/smoke-demo.html");
const audio = path.join(smokeDir, "smoke.mp3");
const srt = path.join(smokeDir, "smoke.srt");
const manifest = path.join(smokeDir, "scene-plan.json");
const video = path.join(smokeDir, "smoke.mp4");
const runLog = path.join(smokeDir, "smoke.run-log.json");

await mkdir(smokeDir, { recursive: true });
execFileSync("ffmpeg", [
  "-y",
  "-f", "lavfi",
  "-i", "anullsrc=r=44100:cl=mono",
  "-t", "6",
  "-c:a", "libmp3lame",
  audio
], { stdio: "ignore" });

await writeFile(srt, [
  "1",
  "00:00:00,000 --> 00:00:02,000",
  "打开演示工作台。",
  "",
  "2",
  "00:00:02,000 --> 00:00:04,000",
  "启动流程并等待状态变化。",
  "",
  "3",
  "00:00:04,000 --> 00:00:06,000",
  "展示关键图表并完成检查。",
  ""
].join("\n"));

await writeFile(manifest, `${JSON.stringify({
  project: "smoke-demo",
  viewport: { width: 1280, height: 720 },
  output: {
    video,
    voiceover: audio,
    srt,
    runLog
  },
  sync: {
    startToleranceMs: 850,
    visibleToleranceMs: 1300
  },
  services: [
    {
      id: "main",
      url: pathToFileURL(fixture).href,
      requiredText: "演示工作台"
    }
  ],
  scenes: [
    {
      id: "open",
      page: "main",
      cueRange: [1, 1],
      narration: "打开演示工作台。",
      actions: [
        { type: "goto", service: "main", waitUntil: "load" }
      ],
      checks: [
        { type: "visibleText", text: "等待开始" }
      ]
    },
    {
      id: "start-flow",
      page: "main",
      cueRange: [2, 2],
      narration: "启动流程并等待状态变化。",
      actions: [
        { type: "clickText", text: "开始" }
      ],
      checks: [
        { type: "visibleText", text: "流程已启动" }
      ]
    },
    {
      id: "show-chart",
      page: "main",
      cueRange: [3, 3],
      narration: "展示关键图表并完成检查。",
      actions: [
        { type: "clickText", text: "展示图表" }
      ],
      checks: [
        { type: "visibleText", text: "关键图表已展示" },
        { type: "visibleSelector", selector: ".chart.is-visible" }
      ]
    }
  ]
}, null, 2)}\n`);

execFileSync("node", [path.join(skillRoot, "scripts/validate-scene-plan.mjs"), manifest], { stdio: "inherit" });
execFileSync("node", [path.join(skillRoot, "scripts/record-runner.mjs"), manifest], { stdio: "inherit" });
execFileSync("node", [path.join(skillRoot, "scripts/verify-sync.mjs"), manifest, runLog, video], { stdio: "inherit" });
execFileSync("node", [path.join(skillRoot, "scripts/probe-video.mjs"), video], { stdio: "inherit" });

console.log(JSON.stringify({ ok: true, manifest, video, runLog }, null, 2));
