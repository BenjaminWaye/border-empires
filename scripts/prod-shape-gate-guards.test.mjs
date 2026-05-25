import test from "node:test";
import assert from "node:assert/strict";
import { validateProdShapeGateResult } from "./prod-shape-gate-guards.mjs";

const targetSha = "0123456789abcdef0123456789abcdef01234567";
const now = new Date("2026-05-25T10:00:00.000Z");

const passingPayload = {
  ok: true,
  at: "2026-05-25T09:30:00.000Z",
  target: {
    gitSha: targetSha,
    wsUrl: "ws://127.0.0.1:3101/ws"
  },
  smokes: {
    login: { ok: true },
    frontier: { ok: true }
  },
  gates: {
    absolute: [{ name: "acceptedP95Ms", ok: true }],
    regression: [{ name: "simAiTickP99Ms", ok: true }]
  }
};

test("accepts a recent passing gate for the deploy target SHA", () => {
  assert.deepEqual(
    validateProdShapeGateResult({ payload: passingPayload, targetSha, now, maxAgeMinutes: 60 }),
    {
      ok: true,
      failures: [],
      targetSha,
      resultSha: targetSha,
      ranAt: "2026-05-25T09:30:00.000Z",
      maxAgeMinutes: 60
    }
  );
});

test("rejects a gate result from another SHA", () => {
  const result = validateProdShapeGateResult({
    payload: { ...passingPayload, target: { ...passingPayload.target, gitSha: "fedcba9876543210fedcba9876543210fedcba98" } },
    targetSha,
    now,
    maxAgeMinutes: 60
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /does not match deploy target/);
});

test("rejects stale gate results", () => {
  const result = validateProdShapeGateResult({
    payload: { ...passingPayload, at: "2026-05-25T08:00:00.000Z" },
    targetSha,
    now,
    maxAgeMinutes: 60
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /stale/);
});

test("rejects failed smoke and metric checks", () => {
  const result = validateProdShapeGateResult({
    payload: {
      ...passingPayload,
      ok: false,
      smokes: {
        login: { ok: false },
        frontier: { ok: true }
      },
      gates: {
        absolute: [{ name: "simAiTickP99Ms", ok: false }],
        regression: []
      }
    },
    targetSha,
    now,
    maxAgeMinutes: 60
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /gate result is not ok/);
  assert.match(result.failures.join("\n"), /login smoke/);
  assert.match(result.failures.join("\n"), /simAiTickP99Ms/);
});
