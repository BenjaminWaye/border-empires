// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceFrontierClaim, type FrontierClaimInput } from "./client-claim-confirm.js";

const toastText = (): string | null | undefined => document.getElementById("action-toast")?.textContent;
const deps = () => ({ appendFeedEntry: vi.fn(), showCaptureAlert: vi.fn() });
const claim = (extra: Partial<FrontierClaimInput> = {}): FrontierClaimInput =>
  ({ target: { x: 3, y: 4 }, actionType: "EXPAND", silent: true, waypointTargets: [], claimedTown: false, ...extra });

afterEach(() => document.getElementById("action-toast")?.remove());

// Regression (first-15 playtest r1, pt-predator / pt-craftseeker): after Expand To nothing said whether
// the tile was claimed. A silent claim (every queued or Expand To EXPAND) wrote nothing visible at all.
describe("claim confirmation", () => {
  it("says Land claimed when the server finishes an Expand To", () => {
    announceFrontierClaim(claim({ waypointTargets: [{ x: 3, y: 4 }] }), deps());
    expect(toastText()).toBe("Land claimed");
  });

  it("says it for a single queued claim too", () => {
    announceFrontierClaim(claim(), deps());
    expect(toastText()).toBe("Land claimed");
  });

  it("stays quiet mid-chain, for a town (its own card) and for an attack", () => {
    announceFrontierClaim(claim({ waypointTargets: [{ x: 9, y: 9 }] }), deps());
    announceFrontierClaim(claim({ claimedTown: true }), deps());
    announceFrontierClaim(claim({ actionType: "ATTACK" }), deps());
    expect(toastText()).toBeUndefined();
  });
});
