#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTrainingRecord,
  getTeacherLabelQualityIssues,
  getTeacherLabelValidationIssues,
  parseJsonLines
} from "./ai-labeling-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const defaultRecordsPath = path.resolve(rootDir, "tmp", "ai-training", "records.jsonl");
const defaultLabelsPath = path.resolve(rootDir, "tmp", "ai-training", "labeled-records.local.jsonl");
const defaultEscalationPath = path.resolve(rootDir, "tmp", "ai-training", "records.escalate.jsonl");
const defaultReportPath = path.resolve(rootDir, "tmp", "ai-training", "triage-report.jsonl");

const usage = () => {
  console.log(
    [
      "Usage:",
      "  node scripts/build-ai-labeling-escalation-set.mjs [records-jsonl] [labels-jsonl] [escalate-jsonl] [report-jsonl]",
      "",
      "Environment:",
      "  AI_LABELING_TRIAGE_MAX_RECORDS=<n>",
      "",
      "This selects records that should be escalated from a cheap local model",
      "to a stronger teacher model based on heuristic triage rules."
    ].join("\n")
  );
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const recordsPath = path.resolve(process.cwd(), process.argv[2] ?? defaultRecordsPath);
const labelsPath = path.resolve(process.cwd(), process.argv[3] ?? defaultLabelsPath);
const escalationPath = path.resolve(process.cwd(), process.argv[4] ?? defaultEscalationPath);
const reportPath = path.resolve(process.cwd(), process.argv[5] ?? defaultReportPath);
const maxRecords = Math.max(0, Number.parseInt(process.env.AI_LABELING_TRIAGE_MAX_RECORDS ?? "0", 10) || 0);

const records = await parseJsonLines(recordsPath);
records.forEach(assertTrainingRecord);

const labels = await parseJsonLines(labelsPath);
const labelsByRecordId = new Map(
  labels.map((entry, index) => {
    if (!entry || typeof entry !== "object" || typeof entry.recordId !== "string") {
      throw new Error(`Label entry ${index + 1} is missing string field "recordId"`);
    }
    if (!entry.label || typeof entry.label !== "object") {
      throw new Error(`Label entry ${index + 1} is missing object field "label"`);
    }
    return [entry.recordId, entry];
  })
);

const collectReasons = (record, labelEntry) => {
  if (!labelEntry) return ["missing_label"];

  const label = labelEntry.label;
  const validationIssues = getTeacherLabelValidationIssues(label);
  return [
    ...validationIssues.map((issue) => `invalid_label:${issue}`),
    ...getTeacherLabelQualityIssues(label, record)
  ];
};

const triageEntries = records.map((record) => {
  const labelEntry = labelsByRecordId.get(record.recordId);
  const reasons = collectReasons(record, labelEntry);
  return {
    recordId: record.recordId,
    chosenActionType: record?.chosenAction?.type ?? null,
    provider: labelEntry?.provider ?? null,
    model: labelEntry?.model ?? null,
    escalate: reasons.length > 0,
    reasons
  };
});

const selectedEntries = maxRecords > 0
  ? triageEntries.filter((entry) => entry.escalate).slice(0, maxRecords)
  : triageEntries.filter((entry) => entry.escalate);
const selectedRecordIds = new Set(selectedEntries.map((entry) => entry.recordId));
const escalatedRecords = records.filter((record) => selectedRecordIds.has(record.recordId));

await mkdir(path.dirname(escalationPath), { recursive: true });
await writeFile(
  escalationPath,
  escalatedRecords.map((entry) => JSON.stringify(entry)).join("\n")
    + (escalatedRecords.length > 0 ? "\n" : ""),
  "utf8"
);
await writeFile(
  reportPath,
  triageEntries.map((entry) => JSON.stringify(entry)).join("\n")
    + (triageEntries.length > 0 ? "\n" : ""),
  "utf8"
);

console.log(
  `Escalated ${escalatedRecords.length}/${records.length} records to ${escalationPath} and wrote triage report to ${reportPath}`
);
