import test from "node:test";
import assert from "node:assert/strict";

import { summarizeGateResult } from "./summarize-prod-shape-gate.mjs";

const healthy = {
  ok: true,
  probe: { autoProbePlayer: true, discovery: { ok: true, playerId: "p1" } },
  soak: { acceptedSamples: 25, acceptedP95Ms: 120, acceptedP99Ms: 200 },
  gates: { absolute: [{ name: "acceptedP95Ms", ok: true }], regression: [] },
  smokes: { login: { ok: true } }
};

test("a substantive pass produces no warnings", () => {
  const { lines, warnings } = summarizeGateResult(healthy);
  assert.deepEqual(warnings, []);
  assert.match(lines.join("\n"), /acceptedSamples=25/);
});

test("zero accepted samples, skipped checks and an undiscovered probe each warn", () => {
  const { warnings } = summarizeGateResult({
    ...healthy,
    probe: { autoProbePlayer: true, discovery: { ok: false, error: "no players" } },
    soak: { acceptedSamples: 0, acceptedP95Ms: null },
    gates: { absolute: [{ name: "acceptedP95Ms", ok: true, skipped: true }], regression: [] }
  });
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((w) => w.includes("acceptedSamples=0")));
  assert.ok(warnings.some((w) => w.includes("skipped: acceptedP95Ms")));
  assert.ok(warnings.some((w) => w.includes("not discovered")));
});
