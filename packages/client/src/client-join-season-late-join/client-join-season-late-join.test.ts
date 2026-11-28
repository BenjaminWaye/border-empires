// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LANDING_MANPOWER_RESERVE, landingManpowerReserve } from "@border-empires/shared";
import { renderJoinSeasonOverlay } from "../client-join-season-overlay.js";
import { applySeasonFullError } from "../client-season-full-error.js";
import { applySeasonErrorCodes } from "../client-join-season-errors/client-season-error-codes.js";
import { applyInitJoinScreenFields, contestDifficulty, lateJoinFacts, lateJoinWarningHtml, leaderTilesFrom } from "./client-join-season-late-join.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const makeState = (overrides: Record<string, unknown> = {}) => ({
  needsSeasonJoin: true,
  joinSeasonOverlayOpen: true,
  joinSeasonId: "season-7",
  joinSeasonPending: false,
  seasonPending: false,
  seasonPendingScheduledStartAt: 0,
  seasonLobbyWaitingCount: 0,
  seasonLobbyMaxPlayers: 0,
  seasonLobbyRoster: [],
  profileSetupRequired: false,
  seasonStartedAt: 0,
  singleContest: false,
  joinSeasonClosedMessage: "",
  leaderboard: { overall: [], byTiles: [] },
  ...overrides
});

const render = (state: ReturnType<typeof makeState>, joinSeason: () => boolean = () => true, renderHud: () => void = () => {}) => {
  const overlayEl = document.createElement("div");
  renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud, joinSeason });
  return overlayEl;
};

describe("lateJoinFacts", () => {
  it("counts contest days from 1 and matches the simulation's landing grant", () => {
    const startedAt = 1_000_000;
    const now = startedAt + 3 * DAY_MS + 5_000;
    const facts = lateJoinFacts(now, startedAt)!;
    expect(facts.day).toBe(4);
    expect(facts.landingManpower).toBe(landingManpowerReserve(now, startedAt));
    expect(facts.catchUp).toBe(facts.landingManpower - LANDING_MANPOWER_RESERVE);
    expect(lateJoinFacts(startedAt, startedAt)).toEqual({ day: 1, landingManpower: LANDING_MANPOWER_RESERVE, catchUp: 0 });
  });

  it("is unknown without a start time (older gateway)", () => {
    expect(lateJoinFacts(5, 0)).toBeUndefined();
  });
});

describe("honest join card (GDD §6)", () => {
  beforeEach(() => document.body.classList.remove("season-lobby-active"));

  it("states the day, the landing manpower and difficulty, and offers waiting instead (regression: players were sent straight in)", () => {
    const now = Date.now();
    const state = makeState({ seasonStartedAt: now - 2 * DAY_MS - 60_000, leaderboard: { overall: [{ tiles: 820 }], byTiles: [] } });
    const joinSeason = vi.fn(() => true);

    const overlayEl = render(state, joinSeason);

    expect(joinSeason).not.toHaveBeenCalled();
    expect(state.joinSeasonPending).toBe(false);
    const text = overlayEl.textContent ?? "";
    expect(text).toContain("day 3");
    expect(text).toMatch(/You land with [\d,]+ extra manpower/);
    expect(text).toContain("Difficulty: high");
    expect(text).toContain("The largest House holds 820 tiles.");
    expect(overlayEl.querySelector("#join-season-wait")?.textContent).toBe("Wait for the next contest");
  });

  it("switches the card to the waiting view when the player chooses to wait", () => {
    const state = makeState({ seasonStartedAt: Date.now() - DAY_MS }) as ReturnType<typeof makeState> & { joinSeasonWaiting?: boolean };
    const renderHud = vi.fn();
    const overlayEl = render(state, () => true, renderHud);

    (overlayEl.querySelector("#join-season-wait") as HTMLButtonElement).click();

    expect(state.joinSeasonWaiting).toBe(true);
    expect(state.joinSeasonOverlayOpen).toBe(true);
    expect(renderHud).toHaveBeenCalled();
  });

  it("closes the card on Not now when the sector has no next contest", () => {
    const state = makeState({ seasonStartedAt: Date.now(), singleContest: true }) as ReturnType<typeof makeState> & { joinSeasonWaiting?: boolean };
    const overlayEl = render(state);

    (overlayEl.querySelector("#join-season-wait") as HTMLButtonElement).click();

    expect(state.joinSeasonOverlayOpen).toBe(false);
    expect(state.joinSeasonWaiting).toBeFalsy();
  });

  it("on a hosted sector (no next contest) offers Not now instead of waiting for a next contest", () => {
    const overlayEl = render(makeState({ seasonStartedAt: Date.now(), singleContest: true }));
    expect(overlayEl.querySelector("#join-season-wait")?.textContent).toBe("Not now");
    expect(overlayEl.textContent).not.toContain("next Sector Contest");
  });

  // First-15 playtest 2026-11-28: every running contest read "Difficulty: high … fight tooth and nail", even on day 1.
  it("calls a young contest with small leaders low, not high, and does not push waiting", () => {
    const overlayEl = render(makeState({ seasonStartedAt: Date.now() - 60_000, leaderboard: { overall: [{ tiles: 40 }], byTiles: [] } }));
    const text = overlayEl.textContent ?? "";
    expect(text).toContain("Difficulty: low.");
    expect(text).not.toContain("Difficulty: high");
    expect(text).not.toContain("tooth and nail");
    expect(text).not.toContain("wait for the next Sector Contest");
  });

  it("still warns about difficulty when the start time is unknown", () => {
    const overlayEl = render(makeState());
    expect(overlayEl.textContent).toContain("Difficulty: high");
    expect(overlayEl.textContent).not.toContain("day ");
  });
});

describe("contestDifficulty", () => {
  it("rates by the largest House's tiles when known", () => {
    expect(contestDifficulty(1, 40)).toBe("low");
    expect(contestDifficulty(1, 150)).toBe("moderate");
    expect(contestDifficulty(2, 499)).toBe("moderate");
    expect(contestDifficulty(2, 500)).toBe("high");
  });

  it("never calls an old contest low, even with small leaders", () => {
    expect(contestDifficulty(8, 40)).toBe("moderate");
  });

  it("falls back to the day without a leaderboard, and to high with neither", () => {
    expect(contestDifficulty(1, undefined)).toBe("low");
    expect(contestDifficulty(3, undefined)).toBe("moderate");
    expect(contestDifficulty(8, undefined)).toBe("high");
    expect(contestDifficulty(undefined, undefined)).toBe("high");
  });

  it("reads the largest House from either leaderboard list", () => {
    expect(leaderTilesFrom({ overall: [{ tiles: 12 }, { tiles: 90 }], byTiles: [{ value: 75 }] })).toBe(90);
    expect(leaderTilesFrom({ overall: [], byTiles: [{ value: 75 }] })).toBe(75);
    expect(leaderTilesFrom({ overall: [], byTiles: [] })).toBeUndefined();
    expect(leaderTilesFrom(undefined)).toBeUndefined();
  });

  it("says one short line per level", () => {
    const facts = { day: 4, landingManpower: 2_000, catchUp: 0 };
    expect(lateJoinWarningHtml(facts, false, 300)).toContain("<strong>Difficulty: moderate.</strong> The largest House holds 300 tiles. Expect border fights.");
    expect(lateJoinWarningHtml(facts, false, 900)).toContain("Expect to fight to hold ground.");
  });
});

describe("NO_LANDING_SITE", () => {
  it("turns the joining card into a closed card with the gateway's message", () => {
    const state = { ...makeState({ joinSeasonPending: true }), seasonEndStarting: false, seasonStartError: undefined, seasonWinner: undefined };
    const renderHud = vi.fn();

    applySeasonErrorCodes(state as any, "NO_LANDING_SITE", "No site. Your place in the next Sector Contest is reserved.", renderHud);
    const overlayEl = render(state);

    expect(renderHud).toHaveBeenCalled();
    expect(state.joinSeasonPending).toBe(false);
    expect(overlayEl.querySelector("#join-season-title")?.textContent).toBe("No landing site left");
    expect(overlayEl.textContent).toContain("is reserved");
    expect(overlayEl.querySelector("#join-season-confirm")).toBeNull();
  });

  it("escapes the message (review regression)", () => {
    const state = { ...makeState(), seasonEndStarting: false, seasonStartError: undefined, seasonWinner: undefined };
    applySeasonErrorCodes(state as any, "NO_LANDING_SITE", "<img src=x onerror=alert(1)>", () => {});
    const overlayEl = render(state);
    expect(overlayEl.querySelector("img")).toBeNull();
    expect(overlayEl.textContent).toContain("<img src=x");
  });

  it("a fresh INIT clears the closed card", () => {
    const state = makeState({ joinSeasonClosedMessage: "closed" });
    applyInitJoinScreenFields(state as any, { seasonStartedAt: 42, singleContest: true });
    expect(state).toMatchObject({ joinSeasonClosedMessage: "", seasonStartedAt: 42, singleContest: true });
  });
});

describe("full Sector", () => {
  it("closes the fullscreen join card when the Sector is full, so the waitlist is reachable", () => {
    const state = { ...makeState({ joinSeasonPending: true }), seasonFull: false, authSessionReady: true, authRetrying: false, authBusy: false, authBusyStartedAt: 0, authBusyTitle: "", authBusyDetail: "" };
    const overlayEl = document.createElement("div");
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason: () => true });
    expect(document.body.classList.contains("season-lobby-active")).toBe(true);
    state.joinSeasonPending = false;
    applySeasonFullError(state, "");
    renderJoinSeasonOverlay({ state: state as any, overlayEl, renderHud: () => {}, joinSeason: () => true });
    expect(overlayEl.style.display).toBe("none");
    expect(document.body.classList.contains("season-lobby-active")).toBe(false);
  });
});
