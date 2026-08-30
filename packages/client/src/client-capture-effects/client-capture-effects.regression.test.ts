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

    renderCaptureProgress(
      {
        captureAlert: undefined,
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
    const captureDismissBtn = makeElement();
    const captureCloseBtn = makeElement();
    const captureDownloadDebugBtn = makeElement();
    const captureBarEl = makeElement();
    const captureTitleEl = makeElement();
    const captureTimeEl = makeElement();
    const captureTargetEl = makeElement();

    renderCaptureProgress(
      {
        captureAlert: undefined,
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
        captureTargetEl
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
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
        captureTargetEl
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
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
        captureTargetEl
      }
    );

    expect(captureCardEl.style.display).toBe("grid");
    expect(captureWrapEl.style.display).toBe("block");
  });

  it("shows a Mustering overlay while a manual attack is parked waiting on manpower", () => {
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
        capture: undefined,
        me: "player-1",
        tiles: new Map([
          ["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", amount: 30, mode: "HOLD", updatedAt: 0 } }],
          [
            "10,20",
            {
              x: 10,
              y: 20,
              terrain: "LAND",
              ownerId: "enemy",
              fort: { ownerId: "enemy", status: "active", variant: "WOODEN_FORT", garrison: 90, garrisonCap: 200 }
            }
          ]
        ]),
        pendingCombatReveal: undefined,
        pendingMusterAttacks: [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" }],
        musterAmountRateByTile: new Map()
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
        captureTargetEl
      }
    );

    expect(captureCardEl.dataset.state).toBe("mustering");
    expect(captureCardEl.style.display).toBe("grid");
    expect(captureTitleEl.textContent).toBe("Mustering...");
    // 30 staged / 150 required (the Palisade's flat per-tier cost,
    // structure-costs.ts's ATTACK_MANPOWER_LOSS_RANGE.WOODEN_FORT.max — not
    // the fort's garrison, which no longer scales the muster gate) = 20%.
    expect(captureBarEl.style.width).toBe("20%");
    expect(captureTimeEl.textContent).toBe("30 / 150");
    expect(captureTargetEl.textContent).toBe("Target: (10, 20)");
    expect(captureCancelBtn.style.display).toBe("inline-flex");
    expect(captureDismissBtn.style.display).toBe("inline-flex");
  });

  // Regression for a live report: the overlay's extrapolation (added to
  // smooth the ~30s-tick-driven staged/required readout between real
  // deltas) previously capped its prediction AT `required`, so once the
  // extrapolated value crossed the threshold — commonly well before the
  // next real tick, since the rate estimate from a short first sample
  // tends to overshoot — the bar showed "ready" (e.g. "60/60") for a long
  // stretch before the real, promotion-driving amount actually got there.
  // Capping just under `required` keeps the bar honest: it can approach
  // but never claim completion ahead of the real data.
  it("never extrapolates the Mustering readout up to or past required before a real delta confirms it", () => {
    const makeDom = () => ({
      captureCardEl: makeElement(),
      captureWrapEl: makeElement(),
      captureCancelBtn: makeElement(),
      captureDismissBtn: makeElement(),
      captureCloseBtn: makeElement(),
      captureDownloadDebugBtn: makeElement(),
      captureBarEl: makeElement(),
      captureTitleEl: makeElement(),
      captureTimeEl: makeElement(),
      captureTargetEl: makeElement()
    });
    const deps = (dom: ReturnType<typeof makeDom>) => ({
      keyFor: (x: number, y: number) => `${x},${y}`,
      formatCooldownShort: () => "0s",
      showCaptureAlert: vi.fn(),
      pushFeed: vi.fn(),
      finalizePredictedCombat: vi.fn(),
      ...dom
    });
    const musterAmountRateByTile = new Map();
    const targetTile = { x: 10, y: 20, terrain: "LAND", ownerId: "enemy", ownershipState: "FRONTIER" };
    const baseState = {
      captureAlert: undefined,
      capture: undefined,
      me: "player-1",
      pendingCombatReveal: undefined,
      pendingMusterAttacks: [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0" }],
      musterAmountRateByTile
    };

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    // First real sample: a small amount from a very short first interval —
    // e.g. 22 staged 7.5s after the flag was created (required is
    // MUSTER_ATTACK_COST = 60 for a plain, non-fort target).
    renderCaptureProgress(
      {
        ...baseState,
        tiles: new Map<string, any>([
          ["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", amount: 22, mode: "HOLD", updatedAt: now } }],
          ["10,20", targetTile]
        ])
      } as any,
      deps(makeDom())
    );

    // 20 seconds later, still no new real delta — a naive linear
    // extrapolation from a 22/7.5s rate would already be well past 60.
    (Date.now as any).mockReturnValue(now + 20_000);
    const dom = makeDom();
    renderCaptureProgress(
      {
        ...baseState,
        tiles: new Map<string, any>([
          ["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", amount: 22, mode: "HOLD", updatedAt: now } }],
          ["10,20", targetTile]
        ])
      } as any,
      deps(dom)
    );

    const parts = dom.captureTimeEl.textContent!.split(" / ").map(Number);
    const staged = parts[0]!;
    const required = parts[1]!;
    expect(required).toBe(60);
    expect(staged).toBeLessThan(required);
    vi.restoreAllMocks();
  });

  it("hides the Mustering overlay once its entry is dismissed, without touching the pending attack", () => {
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
        capture: undefined,
        me: "player-1",
        tiles: new Map([["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", muster: { ownerId: "player-1", amount: 30, mode: "HOLD", updatedAt: 0 } }]]),
        pendingCombatReveal: undefined,
        pendingMusterAttacks: [{ targetX: 10, targetY: 20, fromX: 0, fromY: 0, musterTileKey: "0,0", dismissed: true }]
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
        captureTargetEl
      }
    );

    expect(captureCardEl.style.display).toBe("none");
    expect(captureTitleEl.textContent).toBe("");
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

    renderCaptureProgress(
      {
        captureAlert: undefined,
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
        captureTargetEl
      }
    );

    expect(captureCardEl.style.display).toBe("none");
    expect(captureTitleEl.textContent).toBe("");
  });
});
