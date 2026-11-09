// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSeasonEndOverlay } from "../client-season-end-overlay.js";
import { FORCE_HOLD_MS } from "./season-end-force-hold.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  me: "player-1",
  seasonWinner: { playerId: "player-1", playerName: "Nauticus", crownedAt: 1700000000000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" },
  seasonEndDismissed: false,
  seasonEndStarting: false,
  seasonStartVoteCount: 1,
  seasonStartVoted: true,
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
  const startNewSeason = vi.fn();
  const forceStartNewSeason = vi.fn();
  renderSeasonEndOverlay({ state: state as any, overlayEl, renderHud: () => {}, startNewSeason, forceStartNewSeason });
  const button = overlayEl.querySelector("#se-new-season") as HTMLButtonElement;
  return { button, startNewSeason, forceStartNewSeason };
};

const press = (button: HTMLButtonElement) => button.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
const release = (button: HTMLButtonElement) => button.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true }));

describe("season-end admin force-start hold", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("keeps the voted button reachable for admins and force-starts after a full hold", () => {
    const { button, startNewSeason, forceStartNewSeason } = render(makeState({ mapRevealEligible: true }));
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.textContent).toContain("Vote cast (1/5)");
    press(button);
    vi.advanceTimersByTime(FORCE_HOLD_MS);
    release(button);
    button.click();
    expect(forceStartNewSeason).toHaveBeenCalledTimes(1);
    expect(startNewSeason).not.toHaveBeenCalled();
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
