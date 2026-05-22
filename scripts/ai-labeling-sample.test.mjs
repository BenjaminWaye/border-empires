import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "sample-ai-labeling-records.mjs"
);

const makeRecord = (recordId, playerId, actionType, noCommandReason) => ({
  recordId,
  source: { playerId },
  plannerState: { player: { id: playerId } },
  chosenAction: {
    type: actionType,
    payload: actionType ? { x: 1, y: 1 } : null
  },
  notes: {
    diagnostic: {
      playerId,
      ...(noCommandReason ? { noCommandReason } : {})
    }
  }
});

test("sample-ai-labeling-records caps action and no-op buckets in stable order", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-label-sample-"));
  try {
    const inputPath = path.join(dir, "records.jsonl");
    const outputPath = path.join(dir, "sampled.jsonl");
    const reportPath = path.join(dir, "report.json");
    const inputRecords = [
      makeRecord("expand-1", "ai-1", "EXPAND"),
      makeRecord("expand-2", "ai-1", "EXPAND"),
      makeRecord("expand-3", "ai-1", "EXPAND"),
      makeRecord("noop-1", "ai-1", null, "active_lock"),
      makeRecord("noop-2", "ai-1", null, "active_lock"),
      makeRecord("settle-1", "ai-2", "SETTLE")
    ];
    await writeFile(inputPath, `${inputRecords.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");

    const result = spawnSync(process.execPath, [scriptPath, inputPath, outputPath], {
      env: {
        ...process.env,
        AI_LABELING_SAMPLE_MAX_RECORDS: "4",
        AI_LABELING_SAMPLE_MAX_PER_ACTION: "2",
        AI_LABELING_SAMPLE_MAX_NOOP: "1",
        AI_LABELING_SAMPLE_MAX_PER_PLAYER: "10",
        AI_LABELING_SAMPLE_REPORT_PATH: reportPath
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const sampled = (await readFile(outputPath, "utf8"))
      .trim()
      .split(/\n/)
      .map((line) => JSON.parse(line));
    assert.deepEqual(sampled.map((record) => record.recordId), [
      "expand-1",
      "expand-2",
      "noop-1",
      "settle-1"
    ]);

    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.selectedRecords, 4);
    assert.equal(report.skippedRecords, 2);
    assert.deepEqual(report.selectedByAction, {
      EXPAND: 2,
      "NOOP:active_lock": 1,
      SETTLE: 1
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
