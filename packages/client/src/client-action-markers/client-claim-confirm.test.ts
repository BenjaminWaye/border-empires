import { afterEach, describe, expect, it, vi } from "vitest";
import { announceFrontierClaim, type FrontierClaimInput } from "./client-claim-confirm.js";
import { pendingActionMarkers, resetActionMarkers } from "./client-action-markers.js";

/** The newest map marker as "label@x,y". */
const markerText = (): string | undefined => { const m = pendingActionMarkers().at(-1); return m ? `${m.label}@${m.x},${m.y}` : undefined; };
const deps = () => ({ appendFeedEntry: vi.fn(), showCaptureAlert: vi.fn() });
const claim = (extra: Partial<FrontierClaimInput> = {}): FrontierClaimInput =>
  ({ target: { x: 3, y: 4 }, actionType: "EXPAND", silent: true, waypointTargets: [], claimedTown: false, ...extra });

afterEach(() => resetActionMarkers());

// Regression (first-15 playtest r1, pt-predator / pt-craftseeker): after Expand To nothing said whether
// the tile was claimed. A silent claim (every queued or Expand To EXPAND) wrote nothing visible at all.
describe("claim confirmation", () => {
  it("marks +1 tile on the tile when the server finishes an Expand To", () => {
    announceFrontierClaim(claim({ waypointTargets: [{ x: 3, y: 4 }] }), deps());
    expect(markerText()).toBe("+1 tile@3,4");
  });

  it("says it for a single queued claim too", () => {
    announceFrontierClaim(claim(), deps());
    expect(markerText()).toBe("+1 tile@3,4");
  });

  it("stays quiet mid-chain, for a town (its own card) and for an attack", () => {
    announceFrontierClaim(claim({ waypointTargets: [{ x: 9, y: 9 }] }), deps());
    announceFrontierClaim(claim({ claimedTown: true }), deps());
    announceFrontierClaim(claim({ actionType: "ATTACK" }), deps());
    expect(markerText()).toBeUndefined();
  });
});
