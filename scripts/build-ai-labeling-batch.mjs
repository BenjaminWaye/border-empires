#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTrainingRecord,
  buildBatchEntry,
  buildTokenUsageEntries,
  enforceTokenUsageLimits,
  getMaxOutputTokens,
  getModelPricing,
  parseBooleanEnv,
  parseNonNegativeIntegerEnv,
  parseJsonLines,
  summarizeTokenUsage
} from "./ai-labeling-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const defaultInput = path.resolve(rootDir, "tmp", "ai-training", "records.jsonl");
const defaultOutput = path.resolve(rootDir, "tmp", "ai-training", "labeling-batch.jsonl");
const defaultReport = path.resolve(rootDir, "tmp", "ai-training", "token-usage-report.json");

const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/build-ai-labeling-batch.mjs [input-jsonl] [output-jsonl]",
      "",
      "Environment:",
      "  AI_LABELING_MODEL=<hosted-model>",
      "  AI_LABELING_MAX_RECORDS=<n>              required unless AI_LABELING_DRY_RUN=1",
      "  AI_LABELING_MAX_OUTPUT_TOKENS=<n>       default 384",
      "  AI_LABELING_INPUT_USD_PER_MTOK=<price>  required for hosted cost estimate",
      "  AI_LABELING_OUTPUT_USD_PER_MTOK=<price> required for hosted cost estimate",
      "  AI_LABELING_MAX_INPUT_TOKENS=<n>        optional per-record guard",
      "  AI_LABELING_MAX_TOTAL_TOKENS=<n>        optional batch guard",
      "  AI_LABELING_MAX_ESTIMATED_USD=<n>       optional batch guard",
      "  AI_LABELING_DRY_RUN=1                   write only the usage report",
      "",
      "Input records must be JSON Lines with this minimum shape:",
      '  {"recordId":"...","plannerState":{...},"chosenAction":{...}}',
      "",
      "Optional null fields are omitted and the record JSON is compacted before",
      "being placed at the end of the prompt for provider prefix caching."
    ].join("\n")
  );
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const inputPath = path.resolve(process.cwd(), process.argv[2] ?? defaultInput);
const outputPath = path.resolve(process.cwd(), process.argv[3] ?? defaultOutput);
const reportPath = path.resolve(process.cwd(), process.env.AI_LABELING_TOKEN_REPORT_PATH ?? defaultReport);
const model = process.env.AI_LABELING_MODEL?.trim() || "gpt-5-mini";
const dryRun = parseBooleanEnv("AI_LABELING_DRY_RUN", false);
const maxRecords = parseNonNegativeIntegerEnv("AI_LABELING_MAX_RECORDS", 0);

const records = await parseJsonLines(inputPath);
records.forEach(assertTrainingRecord);

if (!dryRun && maxRecords <= 0) {
  throw new Error(
    "AI_LABELING_MAX_RECORDS is required for hosted batch generation. Run with AI_LABELING_DRY_RUN=1 first, then set an explicit cap."
  );
}

const selectedRecords = maxRecords > 0 ? records.slice(0, maxRecords) : records;
const pricing = getModelPricing(model);
const maxOutputTokens = getMaxOutputTokens();
const usageEntries = buildTokenUsageEntries(selectedRecords, {
  model,
  pricing,
  maxOutputTokens
});
const summary = {
  generatedAt: new Date().toISOString(),
  inputPath,
  outputPath,
  model,
  dryRun,
  selectedRecords: selectedRecords.length,
  totalRecords: records.length,
  pricing,
  ...summarizeTokenUsage(usageEntries)
};

enforceTokenUsageLimits(summary);

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

if (!dryRun) {
  const batchLines = selectedRecords.map((record) => JSON.stringify(buildBatchEntry(record, model)));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${batchLines.join("\n")}\n`, "utf8");
}

console.log(
  dryRun
    ? `Dry run complete for ${selectedRecords.length}/${records.length} records. Wrote token usage report to ${reportPath}`
    : `Wrote ${selectedRecords.length}/${records.length} labeling requests to ${outputPath} and token usage report to ${reportPath}`
);
