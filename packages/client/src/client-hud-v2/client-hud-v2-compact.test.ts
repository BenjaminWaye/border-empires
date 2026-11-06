// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { backStackDepth, pushBackEntry } from "./client-hud-v2-back.js";
import { COMPACT_MIN_BOTTOM_COVER, compactFocusRowOffset } from "./client-hud-v2-compact-camera.js";
import { compactLayerClick, compactTracker, compactTrackerHtml, syncBackEntry, trackerSummaryHtml, treasuryOpen } from "./client-hud-v2-compact.js";
import { applyResourceChip, type ResourcePanelState } from "./client-hud-v2-resource-panel.js";
import type { TrackerInput } from "./client-hud-v2-tracker.js";

const tracker = (over: Partial<TrackerInput> = {}): TrackerInput => ({
  buildSlots: { busy: 2, limit: 3 }, afcReady: 0, flags: [], flagCap: 0, building: [], queue: [], slotsOpen: true, nowMs: 0, ...over
});

// Like a browser, back() fires popstate (asynchronously there; synchronously here).
const fakeHistory = () => ({ pushState: vi.fn(), back: vi.fn(() => window.dispatchEvent(new PopStateEvent("popstate"))) });

describe("compact camera offset", () => {
  it("moves the camera down so the tile sits mid-way between the bar and the bottom panel", () => {
    // 800px screen, bar ends at 50px, tile panel covers the bottom 400px, 40px per tile: shift (400 - 50) / 2 = 175px = 4 rows.
    expect(compactFocusRowOffset({ viewportHeight: 800, topCoverPx: 50, bottomCoverPx: 400, zoom: 40 })).toBe(4);
  });

  it("assumes the tile panel is coming even before it is on screen", () => {
    const withTabBar = compactFocusRowOffset({ viewportHeight: 800, topCoverPx: 50, bottomCoverPx: 60, zoom: 40 });
    expect(withTabBar).toBe(Math.round((800 * COMPACT_MIN_BOTTOM_COVER - 50) / 2 / 40));
  });

  it("never moves the camera for a bad zoom or an empty viewport", () => {
    expect(compactFocusRowOffset({ viewportHeight: 800, topCoverPx: 0, bottomCoverPx: 400, zoom: 0 })).toBe(0);
    expect(compactFocusRowOffset({ viewportHeight: 0, topCoverPx: 0, bottomCoverPx: 0, zoom: 40 })).toBe(0);
  });
});

describe("compact tracker", () => {
  afterEach(() => {
    compactTracker.open = false;
  });

  it("folds to one line with what needs you, slots, flags and the landing attack", () => {
    const html = trackerSummaryHtml(tracker({ afcReady: 1, capture: { x: 1, y: 2, resolvesAt: 42_000, battle: true } }));
    expect(html).toContain("1 needs you");
    expect(html).toContain("Dev 2/3");
    expect(html).toContain("Battle 42s");
    expect(html).toContain("data-v2c-tracker-toggle");
  });

  it("unfolds into the full tracker behind a fold button", () => {
    compactTracker.open = true;
    const html = compactTrackerHtml(tracker());
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Dev slots");
  });

  it("a tap on the line toggles it and repaints", () => {
    document.body.innerHTML = trackerSummaryHtml(tracker());
    const repaint = vi.fn();
    const target = document.querySelector("[data-v2c-tracker-toggle]")!;
    expect(compactLayerClick(target, { layer: document.body, barHtml: () => "", openChip: vi.fn(), repaintTracker: repaint })).toBe(true);
    expect(compactTracker.open).toBe(true);
    expect(repaint).toHaveBeenCalled();
  });
});

describe("direct resource breakdown", () => {
  it.each(["coin", "food", "umbrite", "integrity"])("opens %s in one tap without a Treasury sheet", (chip) => {
    document.body.innerHTML = `<div id="hud-v2-bar"><button data-hud-v2-chip="${chip}"><span>Resource</span></button></div>`;
    const openChip = vi.fn();
    const ctx = { layer: document.body, barHtml: () => "", openChip, repaintTracker: vi.fn() };
    expect(compactLayerClick(document.querySelector("#hud-v2-bar span")!, ctx)).toBe(true);
    expect(openChip).toHaveBeenCalledWith(chip, "toggle");
    expect(treasuryOpen()).toBe(false);
  });
});

describe("compact resource toggle", () => {
  it("closes a resource on the second bar tap and switches on a different chip", () => {
    document.body.innerHTML = `<div id="hud-v2-bar"><button data-hud-v2-chip="coin">Coin</button><button data-hud-v2-chip="food">Food</button></div>`;
    const state: ResourcePanelState = { activePanel: null, economyFocus: "ALL" };
    const ctx = { layer: document.body, barHtml: () => "", openChip: (chip: string, mode: "toggle" | "open" = "open") => applyResourceChip(state, chip, mode), repaintTracker: vi.fn() };
    const coin = document.querySelector('[data-hud-v2-chip="coin"]')!;
    compactLayerClick(coin, ctx);
    expect(state.activePanel).toBe("economy");
    compactLayerClick(coin, ctx);
    expect(state.activePanel).toBeNull();
    compactLayerClick(coin, ctx);
    compactLayerClick(document.querySelector('[data-hud-v2-chip="food"]')!, ctx);
    expect(state).toEqual({ activePanel: "economy", economyFocus: "FOOD" });
  });
});

describe("back gesture", () => {
  it("closes the newest entry only, and a UI close pops without closing anything else", () => {
    const history = fakeHistory();
    const first = vi.fn();
    const second = vi.fn();
    const depth = backStackDepth();
    pushBackEntry(first, history);
    const b = pushBackEntry(second, history);
    b.release();
    expect(second).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(backStackDepth()).toBe(depth);
  });

  // Regression: only screens pushed an entry, so back from Economy or the tile panel left the game page.
  it("keeps one entry while anything is open on a phone; back closes it, and closing from the UI drops it", () => {
    const close = vi.fn();
    const depth = backStackDepth();
    syncBackEntry(true, close);
    syncBackEntry(true, close);
    expect(backStackDepth()).toBe(depth + 1);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(close).toHaveBeenCalledTimes(1);
    // Something still open after that back: the next frame pushes a fresh entry.
    syncBackEntry(true, close);
    expect(backStackDepth()).toBe(depth + 1);
    // Closed from the UI (or not on a phone): the entry goes.
    syncBackEntry(false, close);
    expect(backStackDepth()).toBe(depth);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("Treasury live updates", () => {
  it("updates a row in place when its number ticks, so a tap in flight still lands", async () => {
    const { openTreasury, syncTreasury, closeTreasury } = await import("./client-hud-v2-compact.js");
    document.body.innerHTML = "";
    openTreasury(document.body, `<button data-hud-v2-chip="coin"><span>Coin</span><span>1</span></button>`);
    const before = document.querySelector(".v2c-treasury [data-hud-v2-chip='coin']");
    syncTreasury(`<button data-hud-v2-chip="coin"><span>Coin</span><span>2</span></button>`);
    const after = document.querySelector(".v2c-treasury [data-hud-v2-chip='coin']");
    expect(after).toBe(before);
    expect(after?.textContent).toContain("2");
    // A resource appearing rebuilds the list.
    syncTreasury(`<button data-hud-v2-chip="coin"><span>2</span></button><button data-hud-v2-chip="food"><span>1/2</span></button>`);
    expect(document.querySelector(".v2c-treasury [data-hud-v2-chip='food']")).not.toBeNull();
    closeTreasury();
  });
});
