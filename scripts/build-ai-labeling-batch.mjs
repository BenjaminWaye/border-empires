#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTrainingRecord,
  buildBatchEntry,
  parseJsonLines
} from "./ai-labeling-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const defaultInput = path.resolve(rootDir, "tmp", "ai-training", "records.jsonl");
const defaultOutput = path.resolve(rootDir, "tmp", "ai-training", "labeling-batch.jsonl");

const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/build-ai-labeling-batch.mjs [input-jsonl] [output-jsonl]",
      "",
      "Input records must be JSON Lines with this minimum shape:",
      '  {"recordId":"...","plannerState":{...},"chosenAction":{...}}',
      "",
      "Optional fields such as outcome, visibleSnapshot, and notes are preserved",
      "inside the prompt context so an offline LLM can act as a strategic teacher."
    ].join("\n")
  );
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const inputPath = path.resolve(process.cwd(), process.argv[2] ?? defaultInput);
const outputPath = path.resolve(process.cwd(), process.argv[3] ?? defaultOutput);

const records = await parseJsonLines(inputPath);
records.forEach(assertTrainingRecord);

const batchLines = records.map((record) => JSON.stringify(buildBatchEntry(record)));
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${batchLines.join("\n")}\n`, "utf8");

console.log(`Wrote ${records.length} labeling requests to ${outputPath}`);
