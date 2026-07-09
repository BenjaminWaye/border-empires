import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const clientSource = (relative: string): string => {
  const url = new URL(relative, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
};

// Regression guards for the "silent capture" UX: when topUpFromWaypoint
// enqueues a tile, that queue item is tagged `fromWaypoint`. At dispatch
// time, a fromWaypoint EXPAND on a NEUTRAL tile sets state.capture.silent.
// All downstream surfaces (the big capture overlay, the success popup,
// the success feed entry) must check that flag and stay quiet so a
// multi-step chain doesn't spam four pop-ups in a row.
describe("silent waypoint capture flow", () => {
  it("topUpFromWaypoint tags its enqueues with fromWaypoint: true", () => {
    const source = clientSource("../client-queue-logic/client-queue-logic.ts");
    // The enqueueTarget call inside topUpFromWaypoint must pass the flag;
    // a manual tap's enqueueTarget calls don't.
    expect(source).toMatch(/enqueueTarget\([^)]*\{\s*fromWaypoint:\s*true\s*\}\)/);
  });

  it("dispatch only marks the capture silent for waypoint-driven neutral targets", () => {
    const source = clientSource("../client-queue-logic/client-queue-logic.ts");
    // The `silent` derivation must require BOTH fromWaypoint AND a
    // neutral (un-owned) target. ATTACKs on enemy tiles never go silent.
    expect(source).toMatch(/const silent = Boolean\(next\.fromWaypoint\)\s*&&\s*!to\.ownerId;/);
    expect(source).toContain("state.capture = silent ? { ...baseCapture, silent: true } : baseCapture;");
  });

  it("ACTION_ACCEPTED preserves the silent flag on the rebuilt capture", () => {
    const source = clientSource("../client-network/client-network.ts");
    // The rewrite at ACTION_ACCEPTED has to read the prior silent flag
    // before stomping state.capture, then spread it back in.
    expect(source).toContain("const wasSilent = Boolean(state.capture?.silent && state.capture.target.x === target.x && state.capture.target.y === target.y);");
    expect(source).toMatch(/\.\.\.\(wasSilent \|\| isMusterAdvance \? \{ silent: true/);
  });

  it("COMBAT_START-late capture rewrite preserves the silent flag", () => {
    const source = clientSource("../client-network/client-network.ts");
    expect(source).toContain("const preservedSilent = Boolean(existingCapture?.silent);");
    expect(source).toMatch(/\.\.\.\(preservedSilent \? \{ silent: true/);
  });

  it("renderCaptureProgress hides the big overlay when state.capture.silent is set", () => {
    const source = clientSource("../client-capture-effects/client-capture-effects.ts");
    expect(source).toContain("if (state.capture && state.capture.silent) {");
    // The silent branch must hide the card and return BEFORE the visible
    // capture-progress branch runs.
    const silentIdx = source.indexOf("if (state.capture && state.capture.silent) {");
    const visibleIdx = source.indexOf("if (state.capture) {", silentIdx);
    expect(silentIdx).toBeGreaterThan(-1);
    expect(visibleIdx).toBeGreaterThan(silentIdx);
  });

  it("FRONTIER_RESULT success path skips the popup and feed entry when silent", () => {
    const source = clientSource("../client-network/client-network.ts");
    // The Territory Claimed feed + captureAlert must be wrapped in a
    // non-silent guard derived from state.capture.silent.
    expect(source).toContain('const silentSuccess = Boolean(state.capture?.silent);');
    expect(source).toMatch(/if \(!silentSuccess\) \{[\s\S]*?showCaptureAlert\(resultAlert\.title, resultAlert\.detail, resultAlert\.tone, undefined\);[\s\S]*?\}/);
  });

  it("combatResolutionAlert path skips the popup for a silent EXPAND success only", () => {
    const source = clientSource("../client-network/client-network.ts");
    // The silent-skip on the combat-resolution branch must scope to
    // attackType === "EXPAND" AND a success tone — ATTACK results and
    // failed-tone alerts still fire even during a waypoint.
    expect(source).toContain('const silentExpandSuccess = Boolean(state.capture?.silent && msg.attackType === "EXPAND" && resultAlert.tone === "success");');
    expect(source).toContain("if (!predictedAlreadyShown && !silentExpandSuccess) {");
  });
});
