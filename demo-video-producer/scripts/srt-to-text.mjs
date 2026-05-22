#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error("Usage: srt-to-text.mjs <input.srt> <output.txt>");
  process.exit(2);
}

const text = readFileSync(input, "utf8")
  .trim()
  .split(/\n\s*\n/)
  .map((block) => block
    .split(/\r?\n/)
    .filter((line) => !/^\d+$/.test(line.trim()))
    .filter((line) => !line.includes("-->"))
    .join("\n")
    .trim())
  .filter(Boolean)
  .join("\n\n");

writeFileSync(output, `${text}\n`);
console.log(JSON.stringify({ input, output, characters: text.length }, null, 2));
