import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_MAX_AGE_MINUTES = 360;

export const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadProdShapeGateResult = (resultPath, rootDir = process.cwd()) => {
  if (!resultPath) {
    throw new Error(
      "PROD_SHAPE_GATE_RESULT_JSON is required. Run pnpm ops:prod-shape:gate against an isolated prod-shaped clone first."
    );
  }
  const absolutePath = resolve(rootDir, resultPath);
  return {
    absolutePath,
    payload: JSON.parse(readFileSync(absolutePath, "utf8"))
  };
};

export const validateProdShapeGateResult = ({
  payload,
  targetSha,
  now = new Date(),
  maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES
}) => {
  const failures = [];
  const shortSha = targetSha?.slice(0, 7) ?? "";

  if (!targetSha) {
    failures.push("target SHA is required");
  }
  if (payload?.ok !== true) {
    failures.push("gate result is not ok");
  }

  const resultSha = payload?.target?.gitSha;
  if (typeof resultSha !== "string" || resultSha.length === 0) {
    failures.push("gate result is missing target.gitSha");
  } else if (targetSha && resultSha !== targetSha) {
    failures.push(`gate result SHA ${resultSha.slice(0, 7)} does not match deploy target ${shortSha}`);
  }

  const ranAt = new Date(payload?.at ?? "");
  if (!Number.isFinite(ranAt.getTime())) {
    failures.push("gate result has an invalid at timestamp");
  } else {
    const ageMs = now.getTime() - ranAt.getTime();
    if (ageMs < 0) {
      failures.push("gate result timestamp is in the future");
    }
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    if (ageMs > maxAgeMs) {
      const ageMinutes = Math.round(ageMs / 60000);
      failures.push(`gate result is stale: ${ageMinutes}m old, max ${maxAgeMinutes}m`);
    }
  }

  if (payload?.smokes?.login?.ok !== true) {
    failures.push("login smoke did not pass");
  }
  if (payload?.smokes?.frontier?.ok !== true) {
    failures.push("frontier smoke did not pass");
  }

  const failedChecks = [
    ...(Array.isArray(payload?.gates?.absolute) ? payload.gates.absolute : []),
    ...(Array.isArray(payload?.gates?.regression) ? payload.gates.regression : [])
  ].filter((check) => check?.ok === false);
  if (failedChecks.length > 0) {
    failures.push(`gate has failed metric checks: ${failedChecks.map((check) => check.name ?? "unknown").join(", ")}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    targetSha,
    resultSha,
    ranAt: Number.isFinite(ranAt.getTime()) ? ranAt.toISOString() : null,
    maxAgeMinutes
  };
};

export const assertProdShapeGateResult = (options) => {
  const result = validateProdShapeGateResult(options);
  if (!result.ok) {
    throw new Error(`prod-shape gate verification failed:\n- ${result.failures.join("\n- ")}`);
  }
  return result;
};
