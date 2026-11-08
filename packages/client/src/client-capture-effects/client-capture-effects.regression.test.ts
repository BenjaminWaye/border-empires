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

  it("shows no progress banner while waiting for a delayed frontier result", () => {
    vi.spyOn(Date, "now").mockReturnValue(11_000);
    const captureCardEl = makeElement();
    const captureWrapEl = makeElement();
    const captureCancelBtn = makeElement();
    const captureDismissBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureReportBugBtn = makeElement();
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
        captureReportBugBtn,
        captureBarEl,
        captureTitleEl,
        captureTimeEl,
        captureTargetEl,
        captureGotoBtn
      }
    );

    // Several attacks can resolve at once now; each shows its progress on the
    // map instead of in one "Resolving action..." banner.
    expect(captureCardEl.style.display).toBe("none");
    expect(captureWrapEl.style.display).toBe("none");
    expect(captureTitleEl.textContent).toBe("");
    expect(captureTimeEl.textContent).toBe("");
  });

  it("shows no \"Capturing Territory\" countdown before the resolve deadline", () => {
    vi.spyOn(Date, "now").mockReturnValue(4_100);
    const captureCardEl = makeElement();
    const captureWrapEl = makeElement();
    const captureCancelBtn = makeElement();
    const captureDismissBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureReportBugBtn = makeElement();
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
        captureReportBugBtn,
        captureBarEl,
        captureTitleEl,
        captureTimeEl,
        captureTargetEl,
        captureGotoBtn
      }
    );

    expect(captureCardEl.style.display).toBe("none");
    expect(captureTitleEl.textContent).toBe("");
    expect(captureTimeEl.textContent).toBe("");
    expect(captureCancelBtn.style.display).toBe("none");
    expect(captureDismissBtn.style.display).toBe("none");
  });

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
        captureReportBugBtn: makeElement(),
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
    const captureReportBugBtn = makeElement();
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
        captureReportBugBtn,
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
