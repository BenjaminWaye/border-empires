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
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
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
    const captureReportBugBtn = makeElement();
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
      captureReportBugBtn,
      captureBarEl,
      captureTitleEl,
      captureTimeEl,
      captureTargetEl,
      captureGotoBtn
    };

    renderCaptureProgress(
      {
        captureAlert: {
          title: "Attack failed",
          detail: "Tundra (12, 34) held against you.",
          until: 5_000,
          tone: "warn",
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
          title: "Attack failed",
          detail: "Tundra (12, 34) held against you.",
          until: 5_000,
          tone: "warn",
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

// Playtest 2026-11-18: "House charges arrived" told players to find Manage charges via the crest; the card's
// own button now opens the Charges panel.
describe("renderCaptureProgress panel action", () => {
  const deps = () => ({
    keyFor: (x: number, y: number) => `${x},${y}`,
    formatCooldownShort: () => "0s",
    showCaptureAlert: vi.fn(),
    pushFeed: vi.fn(),
    finalizePredictedCombat: vi.fn(),
    captureCardEl: makeElement(),
    captureWrapEl: makeElement(),
    captureCancelBtn: makeElement(),
    captureDismissBtn: makeElement(),
    captureCloseBtn: makeElement(),
    captureReportBugBtn: makeElement(),
    captureBarEl: makeElement(),
    captureTitleEl: makeElement(),
    captureTimeEl: makeElement(),
    captureTargetEl: makeElement(),
    captureGotoBtn: makeElement() as unknown as HTMLButtonElement
  });
  const state = (alert: Record<string, unknown>) =>
    ({ captureAlert: { title: "House charges arrived", detail: "Keep 2 of 3.", until: 5_000, tone: "warn", ...alert }, activeBattles: new Map(), capture: undefined, me: "p", tiles: new Map(), pendingCombatReveal: undefined, pendingMusterAttacks: [] }) as any;

  it("shows a Manage charges button that carries the panel, not map coordinates", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const d = deps();
    renderCaptureProgress(state({ openPanel: "charges", actionLabel: "Manage charges" }), d);
    const data = d.captureGotoBtn.dataset as Record<string, string>;
    expect(d.captureGotoBtn.style.display).toBe("inline-flex");
    expect(d.captureGotoBtn.textContent).toBe("Manage charges");
    expect(data.captureOpenPanel).toBe("charges");
    expect(data.feedFocusX).toBeUndefined();

    renderCaptureProgress(state({ focusX: 1, focusY: 2, actionLabel: "Center" }), d);
    expect(data.captureOpenPanel).toBeUndefined();
  });

  it("opens the Charges panel without toggling it shut, and clears the card", async () => {
    const { openPanelFromCaptureAlert } = await import("../client-ui-controls/client-ui-controls.js");
    const setActivePanel = vi.fn();
    const s = { activePanel: null, captureAlert: { title: "x", detail: "", until: 1, tone: "warn" } } as any;
    const handlers = { setActivePanel, renderCaptureProgress: vi.fn(), renderHud: vi.fn() };
    expect(openPanelFromCaptureAlert(s, "charges", handlers)).toBe(true);
    expect(setActivePanel).toHaveBeenCalledWith("charges");
    expect(s.captureAlert).toBeUndefined();
    s.activePanel = "charges";
    setActivePanel.mockClear();
    openPanelFromCaptureAlert(s, "charges", handlers);
    expect(setActivePanel).not.toHaveBeenCalled();
    expect(openPanelFromCaptureAlert(s, undefined, handlers)).toBe(false);
  });
});
