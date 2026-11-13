// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SeasonArchiveRecap } from "@border-empires/sim-protocol";

import { renderSeasonEndOverlay } from "../client-season-end-overlay.js";
import { leaderboardHtml } from "../client-panel-html/client-panel-html.js";
import { sectorBoardHtml } from "../client-sector-board/client-sector-board.js";
import { createInitialState } from "../client-state/client-state.js";
import { resetClientForNewSeason } from "../client-season-rollover/client-season-rollover.js";
import { hudV2GameOnScreen } from "../client-hud-v2/client-hud-v2-ready.js";
import { isMapUnobstructed } from "../client-map-unobstructed/client-map-unobstructed.js";
import {
  consumeLastContestRecapDeepLink,
  createInitialLastContestRecapState,
  installLastContestRecapTriggers,
  lastContestRecapEndpoint,
  openLastContestRecap,
  resetLastContestRecapTriggersForTest
} from "./client-last-contest-recap.js";

const WS_URL = "wss://play.example/ws";

// Seven players: more than the archive's top-5 mostPoints, so the recap must
// come from finalStandings to show "every friend or foe".
const recap: SeasonArchiveRecap = {
  seasonId: "season-4", seasonSequence: 4, endedAt: 2_000, updatedAt: 2_000,
  winner: { playerId: "p1", playerName: "Alpha", crownedAt: 2_000, objectiveId: "TOWN_CONTROL", objectiveName: "Town Control" },
  finalStandings: Array.from({ length: 7 }, (_, index) => ({
    id: index === 6 ? "player-1" : `p${index + 1}`, name: index === 6 ? "Nauticus" : `Rival${index + 1}`,
    rank: index + 1, score: 70 - index * 10, tiles: 20 - index, incomePerMinute: 1, techs: 2
  })),
  mostTerritory: [], mostPoints: [], longestSurvivalMs: []
};

const makeState = (overrides: Record<string, unknown> = {}) => ({
  me: "player-1",
  seasonWinner: undefined as unknown,
  seasonEndDismissed: false,
  lastContestRecap: createInitialLastContestRecapState(),
  seasonEndStarting: false,
  seasonStartError: undefined as string | undefined,
  seasonStartVoteCount: 0, seasonStartVoted: false, seasonStartVoteThreshold: 10, authIsGuest: false, needsSeasonJoin: true, mapRevealEligible: false,
  leaderboard: { overall: [], selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined, byTiles: [], byIncome: [], byTechs: [] },
  seasonVictory: [], seasonStats: undefined, seasonScoreHistory: [],
  playerColors: new Map<string, string>(),
  ...overrides
});

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

const render = (state: ReturnType<typeof makeState>, overlayEl: HTMLDivElement, startNewSeason = vi.fn()) =>
  renderSeasonEndOverlay({ state: state as never, overlayEl, renderHud: () => {}, startNewSeason });

afterEach(() => {
  resetLastContestRecapTriggersForTest();
  document.body.innerHTML = "";
});

describe("last contest recap", () => {
  it("derives the HTTP endpoint from the gateway socket URL", () => {
    expect(lastContestRecapEndpoint(WS_URL)).toBe("https://play.example/seasons/last-recap");
    expect(lastContestRecapEndpoint("ws://localhost:3101/ws?x=1")).toBe("http://localhost:3101/seasons/last-recap");
  });

  it("reopens the archived season-end recap after the next contest has started", async () => {
    // Regression: rollover clears seasonWinner, so the recap the new-contest
    // email promised could never be shown again.
    const state = makeState();
    const overlayEl = document.createElement("div");
    render(state, overlayEl);
    expect(overlayEl.style.display).toBe("none");

    const fetchImpl = jsonFetch({ ok: true, recap });
    await openLastContestRecap(state as never, { wsUrl: WS_URL, renderHud: () => {}, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://play.example/seasons/last-recap", expect.anything());

    const startNewSeason = vi.fn();
    render(state, overlayEl, startNewSeason);
    expect(overlayEl.style.display).toBe("grid");
    expect(overlayEl.querySelector(".se-kicker")?.textContent).toBe("Last Sector Contest");
    // Full standings, not the newcomer's compact top-5 card, and "you" highlighted.
    expect(overlayEl.querySelectorAll(".se-rank-row")).toHaveLength(7);
    expect(overlayEl.querySelector(".se-rank-row.is-self")?.textContent).toContain("You");
    // Read-only: no next-contest commit button.
    expect(overlayEl.querySelector("#se-new-season")).toBeNull();

    const close = overlayEl.querySelector("#se-look-around") as HTMLButtonElement;
    expect(close.textContent).toBe("Close");
    close.click();
    expect(state.lastContestRecap.open).toBe(false);
    render(state, overlayEl);
    expect(overlayEl.style.display).toBe("none");
    expect(startNewSeason).not.toHaveBeenCalled();
  });

  it("re-shows the live season-end screen instead of fetching while this contest's winner is on record", async () => {
    const state = makeState({ seasonWinner: recap.winner, seasonEndDismissed: true, needsSeasonJoin: false });
    const fetchImpl = jsonFetch({ ok: true, recap });
    await openLastContestRecap(state as never, { wsUrl: WS_URL, renderHud: () => {}, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(state.seasonEndDismissed).toBe(false);
    expect(state.lastContestRecap.open).toBe(false);
  });

  it("shows a retryable error card when the recap cannot load, and an empty card when there is none", async () => {
    const overlayEl = document.createElement("div");
    const failing = makeState();
    await openLastContestRecap(failing as never, { wsUrl: WS_URL, renderHud: () => {}, fetchImpl: jsonFetch({ ok: false, error: "down" }, 503) });
    render(failing, overlayEl);
    expect(overlayEl.textContent).toContain("Couldn't load");
    expect(overlayEl.querySelector("[data-last-contest-recap-open]")?.textContent).toBe("Try Again");

    const empty = makeState();
    await openLastContestRecap(empty as never, { wsUrl: WS_URL, renderHud: () => {}, fetchImpl: jsonFetch({ ok: true, recap: null }) });
    render(empty, overlayEl);
    expect(overlayEl.textContent).toContain("No finished Sector Contest has a recap yet.");
    (overlayEl.querySelector("#se-recap-close") as HTMLButtonElement).click();
    expect(empty.lastContestRecap.open).toBe(false);
  });

  it("opens from any recap button via the document-level click handler", async () => {
    const state = makeState();
    const fetchImpl = jsonFetch({ ok: true, recap });
    installLastContestRecapTriggers(state as never, { wsUrl: WS_URL, renderHud: () => {}, fetchImpl });
    document.body.innerHTML = leaderboardHtml(state.leaderboard, [], undefined);
    (document.querySelector("[data-last-contest-recap-open]") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(state.lastContestRecap.load).toBe("ready"));
    expect(state.lastContestRecap.open).toBe(true);
  });

  it("offers the recap from the leaderboard and the join-contest screen", () => {
    expect(leaderboardHtml(makeState().leaderboard, [], undefined)).toContain("Last Contest Recap");
    expect(sectorBoardHtml({ kicker: "Sector Contest", board: undefined, joining: false, waitHintHtml: "", lobbyPanelHtml: "" }))
      .toContain("data-last-contest-recap-open");
  });

  it("consumes the ?recap=last deep link once and strips it from the URL", () => {
    const replaceState = vi.fn();
    expect(consumeLastContestRecapDeepLink({ href: "https://play.example/?recap=last&x=3#map" }, { replaceState })).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?x=3#map");
    expect(consumeLastContestRecapDeepLink({ href: "https://play.example/?x=3" }, { replaceState })).toBe(false);
  });

  it("stays visible over the full-screen join-contest lobby, where the email deep link lands", () => {
    // Regression: the lobby hid every other #hud child with !important,
    // including #season-end-overlay, so the reopened recap never appeared.
    const css = readFileSync(resolve(process.cwd(), "src/client-season-lobby-style.css"), "utf8");
    const hideRule = /body\.season-lobby-active #hud > ([^{]+)\{\s*display: none !important;/.exec(css);
    expect(hideRule?.[1]).toContain(":not(#season-end-overlay)");
  });

  it("drops the cached recap at rollover so the next open fetches the newer contest", async () => {
    // Regression: a tab kept open across a rollover kept showing the older contest.
    const state = createInitialState();
    await openLastContestRecap(state as never, { wsUrl: WS_URL, renderHud: () => {}, fetchImpl: jsonFetch({ ok: true, recap }) });
    expect(state.lastContestRecap.load).toBe("ready");
    resetClientForNewSeason(state);
    expect(state.lastContestRecap).toEqual({ open: false, load: "idle" });
  });

  it("closes an open recap when the live season-end screen takes over, so it doesn't resurface after Look Around", async () => {
    const state = makeState();
    await openLastContestRecap(state as never, { wsUrl: WS_URL, renderHud: () => {}, fetchImpl: jsonFetch({ ok: true, recap }) });
    Object.assign(state, { seasonWinner: { ...recap.winner, playerName: "Live Winner" }, needsSeasonJoin: false });
    const overlayEl = document.createElement("div");
    render(state, overlayEl);
    expect(state.lastContestRecap.open).toBe(false);
    (overlayEl.querySelector("#se-look-around") as HTMLButtonElement).click();
    render(state, overlayEl);
    expect(overlayEl.style.display).toBe("none");
  });

  it("counts an open recap as covering the map for the HUD and popup gates", () => {
    const state = createInitialState();
    Object.assign(state, { authSessionReady: true, hasEverInitialized: true, firstChunkAt: 1, mapPrep: false });
    expect(hudV2GameOnScreen(state, undefined)).toBe(true);
    expect(isMapUnobstructed(state)).toBe(true);
    state.lastContestRecap = { open: true, load: "loading" };
    expect(hudV2GameOnScreen(state, undefined)).toBe(false);
    expect(isMapUnobstructed(state)).toBe(false);
  });
});
