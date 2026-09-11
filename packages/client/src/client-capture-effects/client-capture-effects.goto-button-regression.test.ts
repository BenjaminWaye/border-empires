import { describe, expect, it, vi } from "vitest";
import { renderCaptureProgress } from "./client-capture-effects.js";

// Split out of client-capture-effects.regression.test.ts (already near its
// 500-line growth cap) to cover the capture-alert popup's "Go to tile"
// button -- mirrors the Activity Feed's existing focus button, but this
// popup previously had no way to jump to the tile it was talking about.
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

describe("renderCaptureProgress capture-goto-btn", () => {
  it("shows a 'Go to tile' button wired to the alert's target coordinates, and hides it once the alert clears", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
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
    const deps = {
      keyFor: (x: number, y: number) => `${x},${y}`,
      formatCooldownShort: () => "0s",
      showCaptureAlert: vi.fn(),
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
    };

    renderCaptureProgress(
      {
        captureAlert: {
          title: "Victory",
          detail: "Tundra (12, 34) was conquered from Enemy Empire.",
          until: 5_000,
          tone: "success",
          focusX: 12,
          focusY: 34,
          actionLabel: "Center"
        },
        activeBattles: new Map(),
        capture: undefined,
        me: "player-1",
        tiles: new Map(),
        pendingCombatReveal: undefined
      } as any,
      deps
    );

    expect(captureGotoBtn.style.display).toBe("inline-flex");
    expect((captureGotoBtn.dataset as Record<string, string>).feedFocusX).toBe("12");
    expect((captureGotoBtn.dataset as Record<string, string>).feedFocusY).toBe("34");
    expect(captureGotoBtn.textContent).toBe("Center");

    // The alert expires and there's nothing else active -- the button
    // shouldn't linger with stale coordinates.
    vi.spyOn(Date, "now").mockReturnValue(9_000);
    renderCaptureProgress(
      {
        captureAlert: {
          title: "Victory",
          detail: "Tundra (12, 34) was conquered from Enemy Empire.",
          until: 5_000,
          tone: "success",
          focusX: 12,
          focusY: 34,
          actionLabel: "Center"
        },
        activeBattles: new Map(),
        capture: undefined,
        me: "player-1",
        tiles: new Map(),
        pendingCombatReveal: undefined,
        pendingMusterAttacks: []
      } as any,
      deps
    );

    expect(captureGotoBtn.style.display).toBe("none");
    expect((captureGotoBtn.dataset as Record<string, string>).feedFocusX).toBeUndefined();
  });
});
