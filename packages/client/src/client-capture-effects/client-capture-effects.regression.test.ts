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
    const captureDismissBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureDownloadDebugBtn = makeElement();
    const captureBarEl = makeElement();
    const captureTitleEl = makeElement();
    const captureTimeEl = makeElement();
    const captureTargetEl = makeElement();
    const captureGotoBtn = makeElement() as unknown as HTMLButtonElement;

    renderCaptureProgress(
      {
        captureAlert: undefined,
        activeBattles: new Map(),
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
    const captureDismissBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureDownloadDebugBtn = makeElement();
    const captureBarEl = makeElement();
    const captureTitleEl = makeElement();
    const captureTimeEl = makeElement();
    const captureTargetEl = makeElement();
    const captureGotoBtn = makeElement() as unknown as HTMLButtonElement;

    renderCaptureProgress(
      {
        captureAlert: undefined,
        activeBattles: new Map(),
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

    expect(captureCardEl.style.display).toBe("grid");
    expect(captureTitleEl.textContent).toBe("Capturing Territory...");
    expect(captureTimeEl.textContent).toBe("0.9s");
    expect(captureDownloadDebugBtn.style.display).toBe("none");
    expect(captureCancelBtn.style.display).toBe("inline-flex");
    expect(captureDismissBtn.style.display).toBe("inline-flex");
  });

  it("hides the overlay for a dismissed capture without touching the underlying claim", () => {
    vi.spyOn(Date, "now").mockReturnValue(4_100);
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
        activeBattles: new Map(),
        capture: {
          startAt: 1_000,
          resolvesAt: 5_000,
          target: { x: 10, y: 20 }
        },
        dismissedCaptureStartAt: 1_000,
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

    expect(captureCardEl.style.display).toBe("none");
    expect(captureWrapEl.style.display).toBe("none");
  });

  it("reopens the overlay for a new claim on the same tile even if the previous claim was dismissed", () => {
    vi.spyOn(Date, "now").mockReturnValue(4_100);
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
        activeBattles: new Map(),
        capture: {
          startAt: 4_000,
          resolvesAt: 8_000,
          target: { x: 10, y: 20 }
        },
        dismissedCaptureStartAt: 1_000,
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

    expect(captureCardEl.style.display).toBe("grid");
    expect(captureWrapEl.style.display).toBe("block");
  });

  // A parked manual attack used to take this banner over as "Mustering...
  // 30 / 150"; its progress now floats over the flag as a badge
  // (client-muster-pending-badge.ts), so the banner must stay out of the way.
  it("keeps the capture banner hidden while a manual attack is only parked on a muster flag", () => {
    const captureCardEl = makeElement();
    const captureWrapEl = makeElement();
    const captureCancelBtn = makeElement();
    const captureDismissBtn = makeElement();
    const captureTitleEl = makeElement();
    const captureTimeEl = makeElement();

    renderCaptureProgress(
      {
        captureAlert: undefined,
        activeBattles: new Map(),
        capture: undefined,
        me: "player-1",
        tiles: new Map([["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", amount: 30, mode: "HOLD", updatedAt: 0 } }]]),
        pendingCombatReveal: undefined,
        pendingMusterAttacks: [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" }]
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
        captureDismissBtn,
        captureCloseBtn: makeElement(),
        captureDownloadDebugBtn: makeElement(),
        captureBarEl: makeElement(),
        captureTitleEl,
        captureTimeEl,
        captureTargetEl: makeElement(),
        captureGotoBtn: makeElement() as unknown as HTMLButtonElement
      }
    );

    expect(captureCardEl.style.display).toBe("none");
    expect(captureWrapEl.style.display).toBe("none");
    expect(captureCardEl.dataset.state).toBeUndefined();
    expect(captureTitleEl.textContent).toBe("");
    expect(captureTimeEl.textContent).toBe("");
  });

  it("hides the overlay when there is no active capture and nothing pending", () => {
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
        activeBattles: new Map(),
        capture: undefined,
        me: "player-1",
        tiles: new Map(),
        pendingCombatReveal: undefined,
        pendingMusterAttacks: []
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

    expect(captureCardEl.style.display).toBe("none");
    expect(captureTitleEl.textContent).toBe("");
  });
});
