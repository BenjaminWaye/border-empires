// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderJoinSeasonOverlay } from "./client-join-season-overlay.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  needsSeasonJoin: false,
  joinSeasonOverlayOpen: false,
  joinSeasonId: "",
  joinSeasonPending: false,
  ...overrides
});

describe("join-season overlay", () => {
  it("is hidden when needsSeasonJoin is false", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState() as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.style.display).toBe("none");
    expect(overlayEl.innerHTML).toBe("");
  });

  it("is hidden when the player already dismissed it this session", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: false }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.style.display).toBe("none");
  });

  it("renders the join prompt with the season id when needed", () => {
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({
      state: makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" }) as any,
      overlayEl,
      renderHud: () => {},
      joinSeason: () => true
    });
    expect(overlayEl.style.display).toBe("grid");
    expect(overlayEl.innerHTML).toContain("season-42");
    expect(overlayEl.querySelector("#join-season-confirm")).toBeTruthy();
  });

  it("calls joinSeason and marks pending when the confirm button is clicked", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonId: "season-42" });
    const joinSeason = vi.fn(() => true);
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(state.joinSeasonPending).toBe(true);
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("closes the overlay when the close button is clicked", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true });
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason: () => true });
    const closeBtn = overlayEl.querySelector("#join-season-close") as HTMLButtonElement;
    closeBtn.click();
    expect(state.joinSeasonOverlayOpen).toBe(false);
    expect(renderHud).toHaveBeenCalledTimes(1);
  });

  it("does not mark pending when joinSeason fails to send (e.g. not authed yet)", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true });
    const joinSeason = vi.fn(() => false);
    const renderHud = vi.fn();
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(state.joinSeasonPending).toBe(false);
  });

  it("does not re-trigger joinSeason while already pending", () => {
    const overlayEl = document.createElement("div");
    const state = makeState({ needsSeasonJoin: true, joinSeasonOverlayOpen: true, joinSeasonPending: true });
    const joinSeason = vi.fn(() => true);
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason });
    const confirmBtn = overlayEl.querySelector("#join-season-confirm") as HTMLButtonElement;
    confirmBtn.click();
    expect(joinSeason).not.toHaveBeenCalled();
  });
});
