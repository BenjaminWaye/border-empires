import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const clientSource = (relative: string): string => {
  const url = new URL(relative, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
};

// Regression guards for the "silent capture" UX: any EXPAND on a NEUTRAL
// tile sets state.capture.silent by default at dispatch time — the
// tile-paint fill is enough feedback for a queued/chained claim. The one
// exception is a plain manual tap that becomes the active capture
// immediately: client-action-flow.ts's click handler flips silent back off
// for that case, since the big capture overlay (with its Dismiss button)
// is its only feedback now that the tile menu doesn't auto-open for it.
// All downstream surfaces (the big capture overlay, the success popup, the
// success feed entry) must check the flag and stay quiet when it's set.
describe("silent waypoint capture flow", () => {
  it("topUpFromWaypoint tags its enqueues with fromWaypoint: true", () => {
    const source = clientSource("../client-queue-logic/client-queue-logic.ts");
    // The enqueueTarget call inside topUpFromWaypoint must pass the flag;
    // a manual tap's enqueueTarget calls don't.
    expect(source).toMatch(/enqueueTarget\([^)]*\{\s*fromWaypoint:\s*true\s*\}\)/);
  });

  it("dispatch marks the capture silent by default for any neutral (EXPAND) target", () => {
    const source = clientSource("../client-queue-logic/client-queue-logic.ts");
    // The `silent` derivation is scoped to a neutral (un-owned) target —
    // ATTACKs on enemy tiles never go silent, regardless of origin.
    expect(source).toMatch(/const silent = !to\.ownerId;/);
    expect(source).toContain("...(silent ? { silent: true } : {})");
    // The capture also carries actionType from dispatch: the on-map claim
    // plate (client-map-3d.ts) gates on actionType === "EXPAND", NOT on
    // `silent`, so that a direct adjacent tap (which clears silent, see the
    // next test) still animates. Keep these two concerns separate.
    expect(source).toMatch(/const actionType = !to\.ownerId \? "EXPAND" : "ATTACK";/);
    expect(source).toContain("{ ...baseCapture, actionType,");
  });

  it("a plain manual tap that becomes the active capture flips silent back off", () => {
    const source = clientSource("../client-action-flow.ts");
    // This is the one carve-out: the click handler forces silent=false
    // right after dispatch, but only when THIS click's own target became
    // the active capture (queue was idle) — not when it just joined the
    // queue behind an already-in-progress expansion.
    expect(source).toContain("state.capture.silent = false;");
  });

  it("ACTION_ACCEPTED preserves the silent flag on the rebuilt capture", () => {
    const source = clientSource("../client-network/client-network.ts");
    // The rewrite at ACTION_ACCEPTED has to read the prior silent flag
    // before stomping state.capture, then hand it back to buildCaptureState
    // (which only emits `silent` when truthy — see client-siege-tracking.ts).
    expect(source).toContain("const wasSilent = Boolean(state.capture?.silent && state.capture.target.x === target.x && state.capture.target.y === target.y);");
    expect(source).toMatch(/silent: wasSilent \|\| isMusterAdvance/);
  });

  it("COMBAT_START-late capture rewrite preserves the silent flag", () => {
    const source = clientSource("../client-network/client-network.ts");
    expect(source).toMatch(/silent: Boolean\(existingCapture\?\.silent\)/);
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
