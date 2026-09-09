import { describe, expect, it, vi } from "vitest";
import { renderCaptureProgress } from "./client-capture-effects.js";

const makeElement = (): HTMLElement =>
  ({
    style: { display: "" },
    dataset: {},
    textContent: "",
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn()
    }
  } as unknown as HTMLElement);

describe("renderCaptureProgress battle overlay FX gating", () => {
  // Regression: resolvesAt (the server combat-lock clock) used to be the only
  // gate on revealing the predicted result banner, independent of the local
  // battle overlay FX's own timeline (client-battle-overlay.ts's
  // activeBattles). That let the banner declare a winner while the
  // walking-arrow/skirmish animation was still mid-approach, or hadn't even
  // started rendering yet.
  it("holds the result banner until the registered battle overlay FX finishes, even after resolvesAt passes", () => {
    vi.spyOn(Date, "now").mockReturnValue(6_000);
    const captureCardEl = makeElement();
    const captureWrapEl = makeElement();
    const captureCancelBtn = makeElement();
    const captureDismissBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureDownloadDebugBtn = makeElement();
    const captureBarEl = makeElement();
    const captureTitleEl = makeElement();
    const captureTimeEl = makeElement();
    const captureTargetEl = makeElement();
    const captureGotoBtn = makeElement() as unknown as HTMLButtonElement;
    const showCaptureAlert = vi.fn();

    renderCaptureProgress(
      {
        captureAlert: undefined,
        // resolvesAt (5_000) has already passed at now=6_000, but the
        // registered battle FX for this tile doesn't finish until 9_000.
        activeBattles: new Map([
          [
            "10,20",
            {
              originX: 9, originY: 20, targetX: 10, targetY: 20,
              attackerOwnerId: "player-1", defenderOwnerId: "player-2", attackerWon: true,
              startAt: 4_000, clashAt: 5_000, endAt: 9_000, fromSkirmish: false
            }
          ]
        ]),
        capture: {
          startAt: 1_000,
          resolvesAt: 5_000,
          target: { x: 10, y: 20 }
        },
        me: "player-1",
        tiles: new Map(),
        pendingCombatReveal: {
          targetKey: "10,20",
          title: "Victory",
          detail: "Captured (10, 20)",
          tone: "success",
          result: { attackerWon: true },
          revealed: false
        }
      } as any,
      {
        keyFor: (x, y) => `${x},${y}`,
        formatCooldownShort: () => "0s",
        showCaptureAlert,
        pushFeed: vi.fn(),
        finalizePredictedCombat: vi.fn(),
        captureCardEl,
        captureWrapEl,
        captureCancelBtn,
        captureDismissBtn,
        captureCloseBtn,
        captureDownloadDebugBtn,
        captureBarEl,
        captureTitleEl,
        captureTimeEl,
        captureTargetEl,
        captureGotoBtn
      }
    );

    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(captureTitleEl.textContent).toBe("Resolving action...");
  });
});
