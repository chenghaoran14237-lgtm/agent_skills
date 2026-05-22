#!/usr/bin/env node
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const targetRoot = path.resolve(process.argv[2] || process.cwd());
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["assets/templates/scene-plan.template.json", "scene-plan.json"],
  ["assets/templates/custom-actions.template.mjs", "custom-actions.mjs"]
];

await mkdir(targetRoot, { recursive: true });
for (const [sourceRel, targetRel] of files) {
  const source = path.join(skillRoot, sourceRel);
  const target = path.join(targetRoot, targetRel);
  if (existsSync(target)) {
    console.log(JSON.stringify({ skipped: target, reason: "exists" }));
    continue;
  }
  await copyFile(source, target);
  console.log(JSON.stringify({ created: target }));
}
