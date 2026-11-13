import type { LastContestRecapResponse, SeasonArchiveRecap } from "@border-empires/sim-protocol";
import type { LeaderboardOverallEntry, SeasonVictoryObjectiveView, SeasonWinnerView } from "../client-types.js";

// Reopenable "Last Contest Recap": the season-end overlay rebuilt from the
// gateway's newest season archive (GET /seasons/last-recap), so players can
// browse final standings after the next Sector Contest has started -- the
// live season-end data is wiped at rollover (client-season-rollover.ts).
// Opened from the leaderboard / join-season buttons ([data-last-contest-recap-open])
// or the ?recap=last deep link in the new-contest email.

export type LastContestRecapLoad = "idle" | "loading" | "ready" | "empty" | "error";

export type LastContestRecapState = {
  open: boolean;
  load: LastContestRecapLoad;
  recap?: SeasonArchiveRecap;
};

export const createInitialLastContestRecapState = (): LastContestRecapState => ({ open: false, load: "idle" });

export const LAST_CONTEST_RECAP_OPEN_ATTR = "data-last-contest-recap-open";
export const LAST_CONTEST_RECAP_DEEP_LINK = { param: "recap", value: "last" } as const;

type RecapHost = {
  lastContestRecap: LastContestRecapState;
  seasonWinner: SeasonWinnerView | undefined;
  seasonEndDismissed: boolean;
};

export type LastContestRecapDeps = {
  wsUrl: string;
  renderHud: () => void;
  fetchImpl?: typeof fetch;
};

export const lastContestRecapButtonHtml = (label = "Last Contest Recap"): string =>
  `<button type="button" class="panel-btn last-contest-recap-btn" ${LAST_CONTEST_RECAP_OPEN_ATTR}>${label}</button>`;

export const lastContestRecapEndpoint = (wsUrl: string): string => {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/seasons/last-recap";
  url.search = "";
  url.hash = "";
  return url.href;
};

const loadRecap = async (state: RecapHost, deps: LastContestRecapDeps): Promise<void> => {
  state.lastContestRecap = { ...state.lastContestRecap, load: "loading" };
  deps.renderHud();
  try {
    const response = await (deps.fetchImpl ?? fetch)(lastContestRecapEndpoint(deps.wsUrl), { headers: { Accept: "application/json" } });
    const body = (await response.json()) as LastContestRecapResponse;
    if (!response.ok || !body.ok) throw new Error(body.ok ? `HTTP ${response.status}` : body.error);
    state.lastContestRecap = body.recap?.winner
      ? { ...state.lastContestRecap, load: "ready", recap: body.recap }
      : { open: state.lastContestRecap.open, load: "empty" };
  } catch {
    state.lastContestRecap = { open: state.lastContestRecap.open, load: "error" };
  }
  deps.renderHud();
};

/**
 * While the current contest's own winner is on record, its live season-end
 * screen *is* the most recent recap, so just un-dismiss it; otherwise open the
 * archived recap, loading it on first use (and retrying after a failure).
 */
export const openLastContestRecap = (state: RecapHost, deps: LastContestRecapDeps): Promise<void> => {
  if (state.seasonWinner) {
    state.seasonEndDismissed = false;
    deps.renderHud();
    return Promise.resolve();
  }
  state.lastContestRecap = { ...state.lastContestRecap, open: true };
  if (state.lastContestRecap.load === "ready" || state.lastContestRecap.load === "loading") {
    deps.renderHud();
    return Promise.resolve();
  }
  return loadRecap(state, deps);
};

export const closeLastContestRecap = (state: RecapHost, renderHud: () => void): void => {
  state.lastContestRecap = { ...state.lastContestRecap, open: false };
  renderHud();
};

/** True once for a ?recap=last URL; strips the param so a reload doesn't reopen it. */
export const consumeLastContestRecapDeepLink = (location: Pick<Location, "href">, history?: Pick<History, "replaceState">): boolean => {
  const url = new URL(location.href);
  if (url.searchParams.get(LAST_CONTEST_RECAP_DEEP_LINK.param) !== LAST_CONTEST_RECAP_DEEP_LINK.value) return false;
  url.searchParams.delete(LAST_CONTEST_RECAP_DEEP_LINK.param);
  history?.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
};

let triggersInstalled = false;

/** Installs the document-level click handler (the buttons live in innerHTML that re-renders) and honours the deep link, once per page. */
export const installLastContestRecapTriggers = (state: RecapHost, deps: LastContestRecapDeps): void => {
  if (triggersInstalled || typeof document === "undefined") return;
  triggersInstalled = true;
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.(`[${LAST_CONTEST_RECAP_OPEN_ATTR}]`)) return;
    event.preventDefault();
    void openLastContestRecap(state, deps);
  });
  if (consumeLastContestRecapDeepLink(window.location, window.history)) void openLastContestRecap(state, deps);
};

/** Test hook: lets each test install the triggers against a fresh state. */
export const resetLastContestRecapTriggersForTest = (): void => {
  triggersInstalled = false;
};

type RecapOverlayBase = {
  me: string;
  authIsGuest: boolean;
  playerColors: Map<string, string>;
};

const toOverallEntry = (standing: NonNullable<SeasonArchiveRecap["finalStandings"]>[number]): LeaderboardOverallEntry =>
  // The archive has no manpower cap; the recap's rows never show it.
  ({ ...standing, manpowerCap: 0 });

/**
 * The season-end overlay's state slice, rebuilt from the archived recap:
 * frozen standings/victory dials, no next-contest voting, never the compact
 * newcomer card (the whole point is browsing every player's final stats).
 */
export const lastContestRecapOverlayState = <T extends RecapOverlayBase>(state: T & { lastContestRecap: LastContestRecapState }) => {
  const { open, load, recap } = state.lastContestRecap;
  if (!open || load !== "ready" || !recap?.winner) return undefined;
  const overall = (recap.finalStandings ?? []).map(toOverallEntry);
  const selfOverall = overall.find((entry) => entry.id === state.me);
  return {
    me: state.me,
    seasonWinner: recap.winner as SeasonWinnerView,
    leaderboard: { overall, selfOverall, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined, byTiles: [], byIncome: [], byTechs: [] },
    seasonVictory: (recap.seasonVictory ?? []).map((objective) => {
      // A viewer-specific line from the archiving viewer would be wrong for everyone else.
      const { selfProgressLabel: _selfProgressLabel, holdRemainingSeconds: _holdRemainingSeconds, ...rest } = objective;
      return rest as SeasonVictoryObjectiveView;
    }),
    seasonStats: recap.seasonStats ?? recap.winner.seasonStats,
    seasonScoreHistory: [],
    seasonEndDismissed: false,
    seasonEndStarting: false,
    seasonStartError: undefined,
    seasonStartVoteCount: 0,
    seasonStartVoted: false,
    seasonStartVoteThreshold: 0,
    authIsGuest: state.authIsGuest,
    needsSeasonJoin: false,
    playerColors: state.playerColors,
    mapRevealEligible: false
  };
};

/** Small card shown in the overlay while the recap loads, or when there is none to show. */
export const lastContestRecapStatusHtml = (load: LastContestRecapLoad): string => {
  const message =
    load === "loading" ? "Loading the last Sector Contest's recap…"
      : load === "empty" ? "No finished Sector Contest has a recap yet."
        : "Couldn't load the last Sector Contest's recap. Check your connection and try again.";
  return `
    <div class="se-backdrop" aria-hidden="true"></div>
    <div class="se-plate se-recap-status" role="dialog" aria-modal="true" aria-labelledby="se-recap-status-title">
      <div class="se-scroll"><div class="se-scroll-body">
        <h2 id="se-recap-status-title" class="se-title">Last Contest Recap</h2>
        <p class="se-arrival-note" aria-live="polite">${message}</p>
      </div>
      <div class="se-scroll-footer"><footer class="se-actions">
        ${load === "error" ? `<button class="se-btn se-btn-primary" type="button" ${LAST_CONTEST_RECAP_OPEN_ATTR}>Try Again</button>` : ""}
        <button id="se-recap-close" class="se-btn se-btn-secondary" type="button">Close</button>
      </footer></div></div>
    </div>`;
};
