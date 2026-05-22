import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getTeacherLabelQualityIssues,
  getTeacherLabelValidationIssues,
  validateTeacherLabel
} from "./ai-labeling-common.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validateScriptPath = path.join(__dirname, "validate-ai-labels.mjs");

const record = {
  recordId: "record-1",
  plannerState: {
    player: { id: "ai-1", gold: 50 },
    tiles: [{ x: 1, y: 2, ownerId: "ai-1" }]
  },
  chosenAction: { type: "EXPAND", payload: { x: 2, y: 2 } }
};

const strongLabel = {
  phase: "opening",
  primaryGoal: "expand_frontier",
  frontierClass: "economic",
  moveQuality: "strong",
  hiddenMechanics: ["coastal growth setup"],
  tacticalMotifs: ["claim adjacent yield"],
  strategicExplanation: "Expands into a useful economic tile while preserving settlement options.",
  betterAction: null,
  trainingTargets: {
    shouldSettleSoon: false,
    shouldPressureEnemy: false,
    shouldPreferScoutShape: false,
    shouldBuildEconomy: true
  }
};

const weakLabel = {
  ...strongLabel,
  frontierClass: "waste",
  moveQuality: "dubious",
  hiddenMechanics: [],
  tacticalMotifs: [],
  strategicExplanation: "Bad move."
};

test("validateTeacherLabel rejects invalid enum values and wrong target types", () => {
  const issues = getTeacherLabelValidationIssues({
    ...strongLabel,
    moveQuality: "excellent",
    trainingTargets: {
      ...strongLabel.trainingTargets,
      shouldBuildEconomy: "yes"
    }
  });

  assert.ok(issues.some((issue) => issue.includes("moveQuality")));
  assert.ok(issues.some((issue) => issue.includes("trainingTargets.shouldBuildEconomy")));
  assert.throws(() => validateTeacherLabel({ ...strongLabel, phase: "late" }), /Invalid teacher label/);
});

test("getTeacherLabelQualityIssues flags labels that need stronger review", () => {
  assert.deepEqual(getTeacherLabelQualityIssues(strongLabel, record), []);

  const issues = getTeacherLabelQualityIssues(weakLabel, record);
  assert.ok(issues.includes("move_quality_dubious"));
  assert.ok(issues.includes("frontier_class_waste"));
  assert.ok(issues.includes("no_hidden_mechanics"));
  assert.ok(issues.includes("no_tactical_motifs"));
  assert.ok(issues.includes("thin_explanation"));
});

test("validate-ai-labels splits accepted labels from records needing escalation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-label-qa-"));
  try {
    const recordsPath = path.join(dir, "records.jsonl");
    const labelsPath = path.join(dir, "labels.jsonl");
    const acceptedPath = path.join(dir, "accepted.jsonl");
    const escalatePath = path.join(dir, "escalate.jsonl");
    const reportPath = path.join(dir, "report.json");

    const secondRecord = {
      ...record,
      recordId: "record-2",
      chosenAction: { type: "SETTLE", payload: { x: 4, y: 5 } }
    };
    await writeFile(
      recordsPath,
      [record, secondRecord, { ...record, recordId: "record-3" }]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
      "utf8"
    );
    await writeFile(
      labelsPath,
      [
        { recordId: "record-1", provider: "test", model: "strong", label: strongLabel },
        { recordId: "record-2", provider: "test", model: "weak", label: weakLabel }
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
      "utf8"
    );

    const result = spawnSync(
      process.execPath,
      [validateScriptPath, recordsPath, labelsPath, acceptedPath, escalatePath, reportPath],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);

    const accepted = (await readFile(acceptedPath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const escalated = (await readFile(escalatePath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const report = JSON.parse(await readFile(reportPath, "utf8"));

    assert.deepEqual(accepted.map((entry) => entry.recordId), ["record-1"]);
    assert.deepEqual(escalated.map((entry) => entry.recordId), ["record-2", "record-3"]);
    assert.equal(report.acceptedRecords, 1);
    assert.equal(report.escalatedRecords, 2);
    assert.equal(report.counts.issues.missing_label, 1);
    assert.equal(report.counts.issues.move_quality_dubious, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
