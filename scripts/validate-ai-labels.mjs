#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTrainingRecord,
  getTeacherLabelQualityIssues,
  getTeacherLabelValidationIssues,
  parseBooleanEnv,
  parseJsonLines
} from "./ai-labeling-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const defaultRecordsPath = path.resolve(rootDir, "tmp", "ai-training", "records.sampled.jsonl");
const defaultLabelsPath = path.resolve(rootDir, "tmp", "ai-training", "labeled-records.local.jsonl");
const defaultAcceptedPath = path.resolve(rootDir, "tmp", "ai-training", "labeled-records.accepted.jsonl");
const defaultEscalationPath = path.resolve(rootDir, "tmp", "ai-training", "records.qa-escalate.jsonl");
const defaultReportPath = path.resolve(rootDir, "tmp", "ai-training", "label-quality-report.json");

const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/validate-ai-labels.mjs [records-jsonl] [labels-jsonl] [accepted-labels-jsonl] [escalate-records-jsonl] [report-json]",
      "",
      "Environment:",
      "  AI_LABELING_QA_ACCEPT_QUALITY_WARNINGS=1",
      "",
      "Validates teacher label JSON, writes clean labels to accepted-labels-jsonl,",
      "and writes missing/invalid/low-signal records to escalate-records-jsonl."
    ].join("\n")
  );
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const recordsPath = path.resolve(process.cwd(), process.argv[2] ?? defaultRecordsPath);
const labelsPath = path.resolve(process.cwd(), process.argv[3] ?? defaultLabelsPath);
const acceptedPath = path.resolve(process.cwd(), process.argv[4] ?? defaultAcceptedPath);
const escalationPath = path.resolve(process.cwd(), process.argv[5] ?? defaultEscalationPath);
const reportPath = path.resolve(process.cwd(), process.argv[6] ?? defaultReportPath);
const acceptQualityWarnings = parseBooleanEnv("AI_LABELING_QA_ACCEPT_QUALITY_WARNINGS", false);

const increment = (map, key) => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

const countMapToObject = (map) =>
  Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));

const writeJsonLines = async (filePath, entries) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length > 0 ? "\n" : ""),
    "utf8"
  );
};

const records = await parseJsonLines(recordsPath);
records.forEach(assertTrainingRecord);

const labels = await parseJsonLines(labelsPath);
const labelsByRecordId = new Map();
const duplicateRecordIds = [];
const recordIds = new Set(records.map((record) => record.recordId));
for (const [index, entry] of labels.entries()) {
  if (!entry || typeof entry !== "object" || typeof entry.recordId !== "string") {
    throw new Error(`Label entry ${index + 1} is missing string field "recordId"`);
  }
  if (labelsByRecordId.has(entry.recordId)) {
    duplicateRecordIds.push(entry.recordId);
  }
  labelsByRecordId.set(entry.recordId, entry);
}

const acceptedLabels = [];
const escalatedRecords = [];
const reviewEntries = [];
const issueCounts = new Map();
const actionCounts = new Map();
const labelMoveQualityCounts = new Map();
const providerCounts = new Map();
const modelCounts = new Map();

for (const record of records) {
  const labelEntry = labelsByRecordId.get(record.recordId);
  const chosenActionType = record?.chosenAction?.type ?? "UNKNOWN";
  increment(actionCounts, chosenActionType);

  if (!labelEntry) {
    increment(issueCounts, "missing_label");
    escalatedRecords.push(record);
    reviewEntries.push({
      recordId: record.recordId,
      chosenActionType,
      status: "escalate",
      validationIssues: ["missing_label"],
      qualityIssues: []
    });
    continue;
  }

  const validationIssues =
    !labelEntry.label || typeof labelEntry.label !== "object"
      ? ["label must be an object"]
      : getTeacherLabelValidationIssues(labelEntry.label);
  const qualityIssues =
    validationIssues.length > 0 ? [] : getTeacherLabelQualityIssues(labelEntry.label, record);
  for (const issue of validationIssues) increment(issueCounts, `invalid_label:${issue}`);
  for (const issue of qualityIssues) increment(issueCounts, issue);

  if (typeof labelEntry.provider === "string") increment(providerCounts, labelEntry.provider);
  if (typeof labelEntry.model === "string") increment(modelCounts, labelEntry.model);
  if (typeof labelEntry.label?.moveQuality === "string") {
    increment(labelMoveQualityCounts, labelEntry.label.moveQuality);
  }

  const shouldEscalate = validationIssues.length > 0 || (qualityIssues.length > 0 && !acceptQualityWarnings);
  if (shouldEscalate) {
    escalatedRecords.push(record);
  } else {
    acceptedLabels.push({
      ...labelEntry,
      qualityWarnings: qualityIssues
    });
  }

  reviewEntries.push({
    recordId: record.recordId,
    chosenActionType,
    provider: labelEntry.provider ?? null,
    model: labelEntry.model ?? null,
    status: shouldEscalate ? "escalate" : "accepted",
    validationIssues,
    qualityIssues
  });
}

const orphanLabelRecordIds = labels
  .map((entry) => entry.recordId)
  .filter((recordId) => !recordIds.has(recordId));
for (const recordId of duplicateRecordIds) increment(issueCounts, `duplicate_label:${recordId}`);
for (const recordId of orphanLabelRecordIds) increment(issueCounts, `orphan_label:${recordId}`);

await writeJsonLines(acceptedPath, acceptedLabels);
await writeJsonLines(escalationPath, escalatedRecords);
await mkdir(path.dirname(reportPath), { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  recordsPath,
  labelsPath,
  acceptedPath,
  escalationPath,
  acceptQualityWarnings,
  totalRecords: records.length,
  totalLabels: labels.length,
  acceptedRecords: acceptedLabels.length,
  escalatedRecords: escalatedRecords.length,
  duplicateLabelRecordIds: duplicateRecordIds,
  orphanLabelRecordIds,
  counts: {
    actions: countMapToObject(actionCounts),
    labelMoveQuality: countMapToObject(labelMoveQualityCounts),
    providers: countMapToObject(providerCounts),
    models: countMapToObject(modelCounts),
    issues: countMapToObject(issueCounts)
  },
  reviewEntries
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  `Accepted ${acceptedLabels.length}/${records.length} labels; escalated ${escalatedRecords.length}. Wrote report to ${reportPath}`
);
