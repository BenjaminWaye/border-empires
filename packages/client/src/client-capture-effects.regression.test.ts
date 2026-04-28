import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("renderCaptureProgress", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the capture popup visible while waiting for delayed frontier resolution", () => {
    vi.spyOn(Date, "now").mockReturnValue(11_000);
    const captureCardEl = makeElement();
    const captureWrapEl = makeElement();
    const captureCancelBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureDownloadDebugBtn = makeElement();
    const captureBarEl = makeElement();
    const captureTitleEl = makeElement();
    const captureTimeEl = makeElement();
    const captureTargetEl = makeElement();

    renderCaptureProgress(
      {
        captureAlert: undefined,
        collectVisibleCooldownUntil: 0,
        capture: {
          startAt: 1_000,
          resolvesAt: 5_000,
          target: { x: 10, y: 20 }
        },
        me: "player-1",
        tiles: new Map([
          [
            "10,20",
            {
              x: 10,
              y: 20,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              optimisticPending: "expand"
            }
          ]
        ]),
        pendingCombatReveal: undefined
      } as any,
      {
        keyFor: (x, y) => `${x},${y}`,
        formatCooldownShort: () => "0s",
        showCaptureAlert: vi.fn(),
        pushFeed: vi.fn(),
        finalizePredictedCombat: vi.fn(),
        captureCardEl,
        captureWrapEl,
        captureCancelBtn,
        captureCloseBtn,
        captureDownloadDebugBtn,
        captureBarEl,
        captureTitleEl,
        captureTimeEl,
        captureTargetEl
      }
    );

    expect(captureCardEl.style.display).toBe("grid");
    expect(captureWrapEl.style.display).toBe("block");
    expect(captureTitleEl.textContent).toBe("Resolving action...");
    expect(captureTimeEl.textContent).toBe("6.0s");
    expect(captureDownloadDebugBtn.style.display).toBe("inline-flex");
    expect(captureTargetEl.textContent).toContain("Waiting for result");
  });

  it("shows countdown timing before resolve deadline and keeps debug download hidden", () => {
    vi.spyOn(Date, "now").mockReturnValue(4_100);
    const captureCardEl = makeElement();
    const captureWrapEl = makeElement();
    const captureCancelBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureDownloadDebugBtn = makeElement();
    const captureBarEl = makeElement();
    const captureTitleEl = makeElement();
    const captureTimeEl = makeElement();
    const captureTargetEl = makeElement();

    renderCaptureProgress(
      {
        captureAlert: undefined,
        collectVisibleCooldownUntil: 0,
        capture: {
          startAt: 1_000,
          resolvesAt: 5_000,
          target: { x: 10, y: 20 }
        },
        me: "player-1",
        tiles: new Map(),
        pendingCombatReveal: undefined
      } as any,
      {
        keyFor: (x, y) => `${x},${y}`,
        formatCooldownShort: () => "0s",
        showCaptureAlert: vi.fn(),
        pushFeed: vi.fn(),
        finalizePredictedCombat: vi.fn(),
        captureCardEl,
        captureWrapEl,
        captureCancelBtn,
        captureCloseBtn,
        captureDownloadDebugBtn,
        captureBarEl,
        captureTitleEl,
        captureTimeEl,
        captureTargetEl
      }
    );

    expect(captureCardEl.style.display).toBe("grid");
    expect(captureTitleEl.textContent).toBe("Capturing Territory...");
    expect(captureTimeEl.textContent).toBe("0.9s");
    expect(captureDownloadDebugBtn.style.display).toBe("none");
  });
});
