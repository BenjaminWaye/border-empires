// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderCaptureProgress } from "./client-capture-effects.js";
import { CAPTURE_CARD_GHOST_TAP_MS, isCaptureCardGhostTap, resetCaptureCardGhostTapForTests } from "./client-capture-ghost-tap.js";

const el = (): HTMLElement => document.createElement("div");

const renderWith = (captureAlert: { title: string; detail: string; until: number; tone: "success" } | undefined, card: HTMLElement) => {
  const state = { captureAlert, capture: undefined, tiles: new Map(), pendingCombatReveal: undefined, activeBattles: new Map() } as never;
  renderCaptureProgress(state, {
    keyFor: (x: number, y: number) => `${x},${y}`, formatCooldownShort: () => "", showCaptureAlert: vi.fn(), pushFeed: vi.fn(), finalizePredictedCombat: vi.fn(),
    captureCardEl: card, captureWrapEl: el(), captureCancelBtn: el(), captureDismissBtn: el(), captureCloseBtn: el(), captureReportBugBtn: el(),
    captureBarEl: el(), captureTitleEl: el(), captureTimeEl: el(), captureTargetEl: el(), captureGotoBtn: document.createElement("button")
  });
};

const tap = (type: string, x: number, y: number): boolean => {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  return document.body.dispatchEvent(event);
};

afterEach(() => {
  vi.restoreAllMocks();
  resetCaptureCardGhostTapForTests();
});

// Playtest 2026-11-13 (pt-oldphone, three times): "Territory Claimed" closed itself just as the ✕ was tapped,
// and the tap went through to the map (selected a fog tile, once set a waypoint).
describe("result card ghost taps", () => {
  it("swallows a tap where the card was, just after it closed on its own", () => {
    const card = el();
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, right: 310, bottom: 120, width: 300, height: 100, x: 10, y: 20, toJSON: () => ({}) });
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    renderWith({ title: "Territory Claimed", detail: "", until: 5_000, tone: "success" }, card);
    expect(card.style.display).toBe("grid");

    vi.spyOn(Date, "now").mockReturnValue(5_001);
    renderWith({ title: "Territory Claimed", detail: "", until: 5_000, tone: "success" }, card);
    expect(card.style.display).toBe("none");

    const mapTap = vi.fn();
    document.body.addEventListener("pointerdown", mapTap);
    document.body.addEventListener("click", mapTap);
    expect(tap("pointerdown", 300, 30)).toBe(false);
    expect(tap("click", 300, 30)).toBe(false);
    expect(mapTap).not.toHaveBeenCalled();

    // Outside the card, or once the moment has passed, taps reach the map again.
    vi.spyOn(Date, "now").mockReturnValue(5_001 + CAPTURE_CARD_GHOST_TAP_MS + 1);
    expect(isCaptureCardGhostTap(300, 30, Date.now())).toBe(false);
    expect(tap("pointerdown", 300, 30)).toBe(true);
    expect(isCaptureCardGhostTap(400, 300, 5_100)).toBe(false);
  });

  it("does not guard after the player closes the card with its ✕", () => {
    const card = el();
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, right: 310, bottom: 120, width: 300, height: 100, x: 10, y: 20, toJSON: () => ({}) });
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    renderWith({ title: "Territory Claimed", detail: "", until: 5_000, tone: "success" }, card);
    renderWith(undefined, card);
    expect(isCaptureCardGhostTap(300, 30, 1_100)).toBe(false);
  });
});
