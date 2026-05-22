#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTrainingRecord,
  parseNonNegativeIntegerEnv,
  parseJsonLines
} from "./ai-labeling-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const defaultInput = path.resolve(rootDir, "tmp", "ai-training", "records.jsonl");
const defaultOutput = path.resolve(rootDir, "tmp", "ai-training", "records.sampled.jsonl");
const defaultReport = path.resolve(rootDir, "tmp", "ai-training", "sample-report.json");

const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/sample-ai-labeling-records.mjs [input-jsonl] [output-jsonl]",
      "",
      "Environment:",
      "  AI_LABELING_SAMPLE_MAX_RECORDS=<n>       default 120",
      "  AI_LABELING_SAMPLE_MAX_PER_ACTION=<n>   default 40",
      "  AI_LABELING_SAMPLE_MAX_NOOP=<n>         default 20",
      "  AI_LABELING_SAMPLE_MAX_PER_PLAYER=<n>   default 12",
      "  AI_LABELING_SAMPLE_REPORT_PATH=<path>",
      "",
      "The sampler keeps stable input order while capping repetitive action/no-op/player buckets."
    ].join("\n")
  );
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const inputPath = path.resolve(process.cwd(), process.argv[2] ?? defaultInput);
const outputPath = path.resolve(process.cwd(), process.argv[3] ?? defaultOutput);
const reportPath = path.resolve(process.cwd(), process.env.AI_LABELING_SAMPLE_REPORT_PATH ?? defaultReport);

const maxRecords = parseNonNegativeIntegerEnv("AI_LABELING_SAMPLE_MAX_RECORDS", 120) || 120;
const maxPerAction = parseNonNegativeIntegerEnv("AI_LABELING_SAMPLE_MAX_PER_ACTION", 40) || 40;
const maxNoop = parseNonNegativeIntegerEnv("AI_LABELING_SAMPLE_MAX_NOOP", 20) || 20;
const maxPerPlayer = parseNonNegativeIntegerEnv("AI_LABELING_SAMPLE_MAX_PER_PLAYER", 12) || 12;

const actionKeyForRecord = (record) => {
  const actionType = record.chosenAction?.type;
  if (typeof actionType === "string" && actionType.length > 0) return actionType;
  const reason = record.notes?.diagnostic?.noCommandReason;
  return typeof reason === "string" && reason.length > 0 ? `NOOP:${reason}` : "NOOP";
};

const playerIdForRecord = (record) => {
  const playerId = record.source?.playerId ?? record.notes?.diagnostic?.playerId;
  return typeof playerId === "string" && playerId.length > 0 ? playerId : "unknown";
};

const increment = (map, key) => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

const toSortedObject = (map) =>
  Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));

const records = await parseJsonLines(inputPath);
records.forEach(assertTrainingRecord);

const selected = [];
const skipped = [];
const selectedByAction = new Map();
const skippedByAction = new Map();
const selectedByPlayer = new Map();

for (const record of records) {
  const actionKey = actionKeyForRecord(record);
  const playerId = playerIdForRecord(record);
  const actionLimit = actionKey.startsWith("NOOP:") ? maxNoop : maxPerAction;
  const actionCount = selectedByAction.get(actionKey) ?? 0;
  const playerCount = selectedByPlayer.get(playerId) ?? 0;

  if (selected.length >= maxRecords || actionCount >= actionLimit || playerCount >= maxPerPlayer) {
    skipped.push(record);
    increment(skippedByAction, actionKey);
    continue;
  }

  selected.push(record);
  increment(selectedByAction, actionKey);
  increment(selectedByPlayer, playerId);
}

const report = {
  generatedAt: new Date().toISOString(),
  inputPath,
  outputPath,
  totalRecords: records.length,
  selectedRecords: selected.length,
  skippedRecords: skipped.length,
  limits: {
    maxRecords,
    maxPerAction,
    maxNoop,
    maxPerPlayer
  },
  selectedByAction: toSortedObject(selectedByAction),
  skippedByAction: toSortedObject(skippedByAction),
  selectedByPlayer: toSortedObject(selectedByPlayer)
};

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(outputPath, selected.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Sampled ${selected.length}/${records.length} records to ${outputPath} and wrote ${reportPath}`);
