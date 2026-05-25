#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProdShapeGateResult,
  loadProdShapeGateResult,
  parsePositiveNumber
} from "./prod-shape-gate-guards.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const value = process.argv[index + 1];
  if (value && !value.startsWith("--")) {
    args.set(key, value);
    index += 1;
  } else {
    args.set(key, "1");
  }
}

const targetSha = args.get("target-sha") ?? process.env.PROD_SHAPE_TARGET_SHA;
const resultPath = args.get("result") ?? process.env.PROD_SHAPE_GATE_RESULT_JSON;
const maxAgeMinutes = parsePositiveNumber(
  args.get("max-age-minutes") ?? process.env.PROD_SHAPE_GATE_MAX_AGE_MINUTES,
  360
);

try {
  const { absolutePath, payload } = loadProdShapeGateResult(resultPath, rootDir);
  const result = assertProdShapeGateResult({ payload, targetSha, maxAgeMinutes });
  console.log(
    JSON.stringify(
      {
        ok: true,
        resultPath: absolutePath,
        targetSha: result.targetSha,
        ranAt: result.ranAt,
        maxAgeMinutes
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
