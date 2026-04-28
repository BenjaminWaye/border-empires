#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const parseJsonLines = async (filePath) => {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON on line ${index + 1} of ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
};

const assertRecord = (record, index) => {
  if (!record || typeof record !== "object") {
    throw new Error(`Record ${index + 1} must be an object`);
  }
  if (typeof record.recordId !== "string" || record.recordId.length === 0) {
    throw new Error(`Record ${index + 1} is missing string field "recordId"`);
  }
  if (!record.plannerState || typeof record.plannerState !== "object") {
    throw new Error(`Record ${index + 1} is missing object field "plannerState"`);
  }
  if (!record.chosenAction || typeof record.chosenAction !== "object") {
    throw new Error(`Record ${index + 1} is missing object field "chosenAction"`);
  }
};

const buildPrompt = (record) => {
  const context = {
    recordId: record.recordId,
    source: record.source ?? null,
    plannerState: record.plannerState,
    chosenAction: record.chosenAction,
    candidates: record.candidates ?? null,
    visibleSnapshot: record.visibleSnapshot ?? null,
    outcome: record.outcome ?? null,
    notes: record.notes ?? null
  };

  return [
    "You are labeling a Border Empires AI training record.",
    "Act as an expert strategy coach, not as a roleplayer.",
    "Infer the strategic intent, tactical motif, and hidden-mechanic implications behind the chosen action.",
    "Be concrete and terse.",
    "",
    "Return JSON only with this exact shape:",
    "{",
    '  "phase": "opening|growth|pressure|defense|conversion",',
    '  "primaryGoal": "expand_frontier|scout|scaffold_settlement|settle|grow_economy|fortify|pressure_enemy|clear_barbarians|recover",',
    '  "frontierClass": "economic|scaffold|scout|waste|none",',
    '  "moveQuality": "strong|playable|dubious|blunder",',
    '  "hiddenMechanics": ["short strings"],',
    '  "tacticalMotifs": ["short strings"],',
    '  "strategicExplanation": "1-3 sentences",',
    '  "betterAction": null or {"type":"ACTION_TYPE","reason":"short string"},',
    '  "trainingTargets": {',
    '    "shouldSettleSoon": true or false,',
    '    "shouldPressureEnemy": true or false,',
    '    "shouldPreferScoutShape": true or false,',
    '    "shouldBuildEconomy": true or false',
    "  }",
    "}",
    "",
    "Record:",
    JSON.stringify(context, null, 2)
  ].join("\n");
};

const buildBatchEntry = (record) => ({
  custom_id: record.recordId,
  method: "POST",
  url: "/v1/responses",
  body: {
    model: "gpt-5-mini",
    input: buildPrompt(record),
    text: {
      format: {
        type: "json_schema",
        name: "border_empires_ai_teacher_label",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            phase: {
              type: "string",
              enum: ["opening", "growth", "pressure", "defense", "conversion"]
            },
            primaryGoal: {
              type: "string",
              enum: [
                "expand_frontier",
                "scout",
                "scaffold_settlement",
                "settle",
                "grow_economy",
                "fortify",
                "pressure_enemy",
                "clear_barbarians",
                "recover"
              ]
            },
            frontierClass: {
              type: "string",
              enum: ["economic", "scaffold", "scout", "waste", "none"]
            },
            moveQuality: {
              type: "string",
              enum: ["strong", "playable", "dubious", "blunder"]
            },
            hiddenMechanics: {
              type: "array",
              items: { type: "string" }
            },
            tacticalMotifs: {
              type: "array",
              items: { type: "string" }
            },
            strategicExplanation: {
              type: "string"
            },
            betterAction: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: { type: "string" },
                    reason: { type: "string" }
                  },
                  required: ["type", "reason"]
                }
              ]
            },
            trainingTargets: {
              type: "object",
              additionalProperties: false,
              properties: {
                shouldSettleSoon: { type: "boolean" },
                shouldPressureEnemy: { type: "boolean" },
                shouldPreferScoutShape: { type: "boolean" },
                shouldBuildEconomy: { type: "boolean" }
              },
              required: [
                "shouldSettleSoon",
                "shouldPressureEnemy",
                "shouldPreferScoutShape",
                "shouldBuildEconomy"
              ]
            }
          },
          required: [
            "phase",
            "primaryGoal",
            "frontierClass",
            "moveQuality",
            "hiddenMechanics",
            "tacticalMotifs",
            "strategicExplanation",
            "betterAction",
            "trainingTargets"
          ]
        }
      }
    }
  }
});

const records = await parseJsonLines(inputPath);
records.forEach(assertRecord);

const batchLines = records.map((record) => JSON.stringify(buildBatchEntry(record)));
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${batchLines.join("\n")}\n`, "utf8");

console.log(`Wrote ${records.length} labeling requests to ${outputPath}`);
