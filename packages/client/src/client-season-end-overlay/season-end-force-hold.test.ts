// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSeasonEndOverlay } from "../client-season-end-overlay.js";
import { FORCE_HOLD_MS } from "./season-end-force-hold.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  me: "player-1",
  seasonWinner: { playerId: "player-1", playerName: "Nauticus", crownedAt: 1700000000000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" },
  seasonEndDismissed: false,
  seasonEndStarting: false,
  seasonStartError: undefined as string | undefined,
  seasonStartVoteCount: 1,
  seasonStartVoted: true, seasonStartVoteThreshold: 10, authIsGuest: false, needsSeasonJoin: false,
  mapRevealEligible: false,
  leaderboard: { overall: [], selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined, byTiles: [], byIncome: [], byTechs: [] },
  seasonVictory: [],
  seasonStats: undefined,
  seasonScoreHistory: [],
  playerColors: new Map<string, string>(),
  ...overrides
});

const render = (state: ReturnType<typeof makeState>) => {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  const startNewSeason = vi.fn();
  const forceStartNewSeason = vi.fn(() => true);
  renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason, forceStartNewSeason });
  const button = overlayEl.querySelector("#se-new-season") as HTMLButtonElement;
  return { button, startNewSeason, forceStartNewSeason };
};

const press = (button: HTMLButtonElement) => button.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
const release = (button: HTMLButtonElement) => button.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }));

describe("season-end admin force-start hold", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  it("keeps the voted button reachable for admins and force-starts after a full hold", () => {
    const { button, startNewSeason, forceStartNewSeason } = render(makeState({ mapRevealEligible: true }));
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toContain("You're in · 1/10 Houses committed");
    press(button);
    vi.advanceTimersByTime(FORCE_HOLD_MS);
    release(button);
    button.click();
    expect(forceStartNewSeason).toHaveBeenCalledTimes(1);
    expect(startNewSeason).not.toHaveBeenCalled();
  });

  it("does not force-start when the overlay re-renders mid-hold", () => {
    const overlayEl = document.createElement("div");
    document.body.appendChild(overlayEl);
    const forceStartNewSeason = vi.fn(() => true);
    const deps = { state: makeState({ mapRevealEligible: true }) as any, overlayEl, renderHud: () => {}, startNewSeason: vi.fn(), forceStartNewSeason };
    renderSeasonEndOverlay(deps);
    press(overlayEl.querySelector("#se-new-season") as HTMLButtonElement);
    vi.advanceTimersByTime(200);
    // Another player's vote changes the signature and replaces the button;
    // the release lands on the new button, never cancelling the old timer.
    renderSeasonEndOverlay({ ...deps, state: makeState({ mapRevealEligible: true, seasonStartVoteCount: 2 }) as any });
    release(overlayEl.querySelector("#se-new-season") as HTMLButtonElement);
    vi.advanceTimersByTime(FORCE_HOLD_MS);
    expect(forceStartNewSeason).not.toHaveBeenCalled();
    overlayEl.remove();
  });

  // Regression: a completed hold gave no feedback and the button stayed live,
  // so the admin kept force-starting while the world was being built.
  it("shows the start immediately after a completed hold and blocks repeats", () => {
    const state = makeState({ mapRevealEligible: true, seasonStartError: "earlier refusal" });
    const overlayEl = document.createElement("div");
    document.body.appendChild(overlayEl);
    const forceStartNewSeason = vi.fn(() => true);
    const deps = { state: state as any, overlayEl, renderHud: () => renderSeasonEndOverlay(deps), startNewSeason: vi.fn(), forceStartNewSeason };
    renderSeasonEndOverlay(deps);
    const button = overlayEl.querySelector("#se-new-season") as HTMLButtonElement;
    press(button);
    vi.advanceTimersByTime(FORCE_HOLD_MS);
    expect(forceStartNewSeason).toHaveBeenCalledTimes(1);
    expect(state.seasonEndStarting).toBe(true);
    expect(state.seasonStartError).toBeUndefined();
    const after = overlayEl.querySelector("#se-new-season") as HTMLButtonElement;
    expect(after.disabled).toBe(true);
    expect(after.hasAttribute("data-se-force-hold")).toBe(false);
    expect(after.textContent).toContain("Starting the next Sector Contest");
    press(after);
    vi.advanceTimersByTime(FORCE_HOLD_MS * 2);
    expect(forceStartNewSeason).toHaveBeenCalledTimes(1);
  });

  // Regression: the start was shown even when the request never left (socket
  // down / not signed in), so the admin was told a world was being built.
  it("does not show a start when the force request was not sent", () => {
    const state = makeState({ mapRevealEligible: true });
    const overlayEl = document.createElement("div");
    document.body.appendChild(overlayEl);
    const forceStartNewSeason = vi.fn(() => false);
    renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason: vi.fn(), forceStartNewSeason });
    press(overlayEl.querySelector("#se-new-season") as HTMLButtonElement);
    vi.advanceTimersByTime(FORCE_HOLD_MS);
    expect(forceStartNewSeason).toHaveBeenCalledTimes(1);
    expect(state.seasonEndStarting).toBe(false);
  });

  it("shows a refused start on the overlay instead of only in the feed", () => {
    const { button } = render(makeState({ mapRevealEligible: true, seasonStartError: "Only the admin account can force-start." }));
    const error = button.ownerDocument.querySelector(".se-start-error");
    expect(error?.textContent).toBe("Only the admin account can force-start.");
    expect(error?.getAttribute("role")).toBe("alert");
  });

  it("does not force-start when the admin releases early", () => {
    const { button, forceStartNewSeason } = render(makeState({ mapRevealEligible: true }));
    press(button);
    vi.advanceTimersByTime(FORCE_HOLD_MS - 100);
    release(button);
    vi.advanceTimersByTime(1000);
    expect(forceStartNewSeason).not.toHaveBeenCalled();
  });

  it("a completed hold before voting force-starts without also casting a vote", () => {
    const { button, startNewSeason, forceStartNewSeason } = render(makeState({ mapRevealEligible: true, seasonStartVoted: false, seasonStartVoteCount: 0 }));
    press(button);
    vi.advanceTimersByTime(FORCE_HOLD_MS);
    release(button);
    button.click();
    expect(forceStartNewSeason).toHaveBeenCalledTimes(1);
    expect(startNewSeason).not.toHaveBeenCalled();
  });

  it("non-admins keep the disabled voted button and cannot force-start", () => {
    const { button, forceStartNewSeason } = render(makeState());
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("data-se-force-hold")).toBe(false);
    press(button);
    vi.advanceTimersByTime(FORCE_HOLD_MS * 2);
    expect(forceStartNewSeason).not.toHaveBeenCalled();
  });
});
