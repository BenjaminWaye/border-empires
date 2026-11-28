import { describe, expect, it, vi } from "vitest";
import { announceFrontierClaim } from "../client-action-markers/client-claim-confirm.js";
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
    const source = clientSource("../client-adjacent-expand-claim/client-adjacent-expand-claim.ts");
    // client-action-flow.ts's queueAdjacentExpandClaim now submits via
    // enqueueAdjacentExpandWaypoint (the durable waypoint queue) instead of
    // client-queue-logic.ts's enqueueTarget/processActionQueue directly, but
    // the dispatch that actually runs is the same either way (topUpFromWaypoint
    // feeds the enqueued target into the same actionQueue drain), so it
    // still defaults a neutral-target capture to silent -- this helper must
    // still un-silence it for THIS click's own target after draining, same
    // carve-out as before, just relocated here. An earlier version tried to
    // set state.capture optimistically *before* draining instead, which got
    // clobbered by that same synchronous dispatch (or misattributed to the
    // wrong target if something else was already in flight) -- this must
    // run after processActionQueue, not before.
    expect(source).toContain("processActionQueue();\n  if (state.capture && state.capture.target.x === x && state.capture.target.y === y) state.capture.silent = false;");
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

  it("renderCaptureProgress never reveals a result banner for a silent capture", () => {
    const source = clientSource("../client-capture-effects/client-capture-effects.ts");
    // No in-progress banner exists any more (hideCaptureCard runs for every
    // capture); the only capture-driven popup left is the locked-result
    // reveal, which silent waypoint claims must skip.
    expect(source).toContain("hideCaptureCard(deps);");
    expect(source).toContain("if (state.capture && !state.capture.silent) revealLockedCombatResult(state, deps);");
  });

  it("FRONTIER_RESULT success path skips the popup and feed entry when silent", () => {
    const source = clientSource("../client-network/client-network.ts");
    // client-network.ts hands the silent flag from state.capture to announceFrontierClaim
    // (client-claim-confirm.ts), whose behaviour client-claim-confirm.test.ts covers.
    expect(source).toContain("silent: Boolean(state.capture?.silent)");
    const deps = { appendFeedEntry: vi.fn(), showCaptureAlert: vi.fn() };
    announceFrontierClaim({ target: { x: 1, y: 2 }, actionType: "EXPAND", silent: true, waypointTargets: [{ x: 5, y: 5 }], claimedTown: false }, deps);
    expect(deps.appendFeedEntry).not.toHaveBeenCalled();
    expect(deps.showCaptureAlert).not.toHaveBeenCalled();
    announceFrontierClaim({ target: { x: 1, y: 2 }, actionType: "EXPAND", silent: false, waypointTargets: [], claimedTown: false }, deps);
    expect(deps.appendFeedEntry).toHaveBeenCalledOnce();
    expect(deps.showCaptureAlert).toHaveBeenCalledWith("Territory Claimed", "Territory at (1, 2) was claimed.", "success", undefined, { x: 1, y: 2, actionLabel: "Center" });
  });

  it("combatResolutionAlert path skips the popup for a silent EXPAND success only", () => {
    const source = clientSource("../client-network/client-combat-result-notifications.ts");
    // The silent-skip on the combat-resolution branch must scope to
    // attackType === "EXPAND" AND a success tone — ATTACK results and
    // failed-tone alerts still fire even during a waypoint.
    expect(source).toContain('const silentExpandSuccess = Boolean(state.capture?.silent && msg.attackType === "EXPAND" && resultAlert.tone === "success");');
    expect(source).toContain("if (!predictedAlreadyShown && !silentExpandSuccess) {");
  });
});
