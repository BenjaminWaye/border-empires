import type { ClientState } from "./client-state/client-state.js";
import { attachSeasonForceHold, consumeForceHoldClick } from "./client-season-end-overlay/season-end-force-hold.js";
import type {
  LeaderboardOverallEntry,
  LeaderboardMetricEntry,
  SeasonVictoryObjectiveView,
  SeasonWinnerView
} from "./client-types.js";
import { setReportOpen } from "./client-bug-report/client-bug-report.js";
import { escapeHtml } from "./client-season-end-overlay/client-season-end-html.js";
import {
  closeLastContestRecap, installLastContestRecapTriggers, lastContestRecapOverlayState, lastContestRecapStatusHtml
} from "./client-last-contest-recap/client-last-contest-recap.js";
import { miscPanel } from "./client-season-end-overlay/client-season-end-misc-panel.js";
import { ensureHouseChargeReveal, houseChargeRevealHtml } from "./client-house-charges/client-house-charge-reveal.js";
import { scoreGraphPanel } from "./client-season-end-score-graph.js";
import { nextContestButtonLabel, nextContestFineprint } from "./client-next-contest/client-next-contest.js";

type SeasonEndLeaderboard = {
  overall: LeaderboardOverallEntry[];
  selfOverall: LeaderboardOverallEntry | undefined;
  byTiles: LeaderboardMetricEntry[];
  byIncome: LeaderboardMetricEntry[];
  byTechs: LeaderboardMetricEntry[];
};

type SeasonEndViewState = Pick<
    ClientState,
    | "me"
    | "seasonWinner"
    | "leaderboard"
    | "seasonVictory"
    | "seasonStats"
    | "seasonScoreHistory"
    | "seasonEndDismissed"
    | "seasonEndStarting"
    | "seasonStartError"
    | "seasonStartVoteCount"
    | "seasonStartVoted"
    | "seasonStartVoteThreshold"
    | "authIsGuest"
    | "needsSeasonJoin"
    | "playerColors"
    | "mapRevealEligible"
  > & Partial<Pick<ClientState, "houseChargeReveal">>;

type SeasonEndOverlayDeps = {
  state: SeasonEndViewState & Pick<ClientState, "lastContestRecap">;
  overlayEl: HTMLDivElement;
  renderHud: () => void;
  // Commits this House to the next Sector Contest.
  startNewSeason: () => void;
  // Admin-only (mapRevealEligible = server canToggleFog): long-press the
  // button to start the next contest without waiting for commitments.
  // Returns whether the request was sent (false while signed out/offline).
  forceStartNewSeason?: () => boolean;
  // Guests can't commit; the button offers to save the empire instead.
  openGuestSave?: () => void;
  // Enables the reopenable Last Contest Recap (client-last-contest-recap).
  wsUrl?: string;
};

// The plate renderer's inputs: the live season-end slice, or one rebuilt from
// the archived recap (with `recap` set: read-only, a Close button instead of
// the next-contest controls).
type SeasonEndPlateDeps = Omit<SeasonEndOverlayDeps, "state"> & {
  state: SeasonEndViewState;
  recap?: { onClose: () => void };
};

const SEASON_START_SIGN_IN_MESSAGE = "Finish sign-in before joining the next Sector Contest.";

// Commit and admin force-start senders for the season-end overlay's button.
export const seasonStartSenders = (
  send: (payload: unknown, message?: string) => boolean
): Pick<SeasonEndOverlayDeps, "startNewSeason" | "forceStartNewSeason"> => ({
  startNewSeason: () => { send({ type: "START_NEW_SEASON" }, SEASON_START_SIGN_IN_MESSAGE); },
  forceStartNewSeason: () => send({ type: "START_NEW_SEASON", force: true }, SEASON_START_SIGN_IN_MESSAGE)
});

export const safeColorValue = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : undefined;
};

export const playerBadge = (
  playerId: string | undefined,
  name: string,
  colors: ReadonlyMap<string, string>
): string => {
  const color = safeColorValue(playerId ? colors.get(playerId) : undefined);
  return `<span class="se-badge"><span class="se-badge-dot${color ? "" : " is-unknown"}"${
    color ? ` style="--player-color:${color}"` : ""
  } aria-hidden="true"></span><span class="se-badge-name">${escapeHtml(name)}</span></span>`;
};

// Rows on the newcomer's short result card.
const COMPACT_STANDINGS_ROWS = 5;

const rankClass = (rank: number): string =>
  rank === 1 ? "is-gold" : rank === 2 ? "is-silver" : rank === 3 ? "is-bronze" : "";

const currentPlayerName = (leaderboard: SeasonEndLeaderboard, id: string | undefined, fallback: string): string => {
  const entry = leaderboard.overall.find((player) => player.id === id)
    ?? (leaderboard.selfOverall?.id === id ? leaderboard.selfOverall : undefined);
  return entry?.name ?? fallback;
};

const num = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const seasonEndVisible = (state: SeasonEndViewState): boolean =>
  Boolean(state.seasonWinner) && !state.seasonEndDismissed;

const seasonEndScoreHistory = (state: SeasonEndViewState): ClientState["seasonScoreHistory"] => {
  const saved = state.seasonWinner?.scoreHistory;
  return saved?.some((series) => series.points.length > 0) ? saved : state.seasonScoreHistory;
};

const renderSignature = (state: SeasonEndViewState, leaderboard: SeasonEndLeaderboard, recap: boolean): string =>
  JSON.stringify({
    recap,
    winner: [state.seasonWinner?.playerId, state.seasonWinner?.playerName, state.seasonWinner?.crownedAt],
    objective: state.seasonWinner?.objectiveName,
    starting: state.seasonEndStarting,
    startError: state.seasonStartError,
    voteCount: state.seasonStartVoteCount,
    voted: state.seasonStartVoted,
    threshold: state.seasonStartVoteThreshold,
    guest: state.authIsGuest,
    compact: state.needsSeasonJoin,
    admin: state.mapRevealEligible,
    charges: state.houseChargeReveal ? [state.houseChargeReveal.key, typeof state.houseChargeReveal.view === "string" ? state.houseChargeReveal.view : "ready"] : null,
    self: [leaderboard.selfOverall?.id, leaderboard.selfOverall?.name],
    overall: leaderboard.overall.map((e) => [e.id, e.name, e.rank, e.score, e.tiles, e.incomePerMinute, e.techs]),
    victory: state.seasonVictory.map((o) => [o.id, o.statusLabel, o.leaderPlayerId, o.leaderName, o.progressLabel, o.conditionMet]),
    stats: state.seasonStats ?? state.seasonWinner?.seasonStats,
    // Cheap-but-sufficient signature for a per-player time series: point
    // count + last value catches "a new sample arrived" without hashing the
    // whole (small, capped) series every render.
    scoreHistory: seasonEndScoreHistory(state)
      .map((s) => [s.playerId, s.playerName, s.points.length, s.points[s.points.length - 1]?.score ?? 0])
  });

const victorMedallion = (
  winner: SeasonWinnerView,
  colors: ReadonlyMap<string, string>,
  isSelf: boolean
): string => `
  <div class="se-victor">
    <div class="se-gear se-gear-lg" aria-hidden="true"></div>
    <div class="se-medallion">
      <span class="se-crown" aria-hidden="true">♛</span>
      <span class="se-victor-kicker">Contest Victor</span>
      <span class="se-victor-name">${playerBadge(winner.playerId, isSelf ? "You" : winner.playerName, colors)}</span>
      <span class="se-victor-path">${escapeHtml(winner.objectiveName)}</span>
      <span class="se-victor-date">Crowned ${escapeHtml(new Date(winner.crownedAt).toLocaleString())}</span>
    </div>
  </div>`;

const rankRowHtml = (
  entry: LeaderboardOverallEntry,
  colors: ReadonlyMap<string, string>,
  options: { self: boolean; detached?: boolean; winnerId: string | undefined }
): string => {
  // Score rank (the gold/silver/bronze medal) and the season winner (the
  // crown) are independent -- the winner is decided by their victory path,
  // not necessarily by having the top score. Swapping the medal's number for
  // a crown while keeping its rank-based color (e.g. silver) read as if 2nd
  // place had won, so the crown is now a separate badge next to the name and
  // the medal always shows the entry's true score rank.
  const isWinner = Boolean(options.winnerId && entry.id === options.winnerId);
  const medalClass = options.detached ? "" : rankClass(entry.rank);
  const crown = isWinner ? `<span class="se-rank-crown" title="Contest Victor" aria-hidden="true">♔</span>` : "";
  return `
    <li class="se-rank-row${options.self ? " is-self" : ""}${options.detached ? " is-detached" : ""}${isWinner ? " is-winner" : ""}">
      <span class="se-rank-medal ${medalClass}">${entry.rank}</span>
      <span class="se-rank-name">${crown}${playerBadge(entry.id, options.self ? "You" : entry.name, colors)}</span>
      <span class="se-rank-stats">
        <span class="se-gauge" title="Final score"><em>${num(entry.score, 1)}</em><span>score</span></span>
        <span class="se-gauge" title="Garrisoned tiles"><em>${num(entry.tiles)}</em><span>tiles</span></span>
        <span class="se-gauge" title="Income / day"><em>${num(entry.incomePerMinute * 1440, 1)}</em><span>coin/day</span></span>
        <span class="se-gauge" title="Manifests"><em>${num(entry.techs)}</em><span>manifests</span></span>
      </span>
    </li>`;
};

const standingsLedger = (
  leaderboard: SeasonEndLeaderboard,
  colors: ReadonlyMap<string, string>,
  selfId: string | undefined,
  winnerId: string | undefined
): string => {
  const rows = leaderboard.overall
    .map((entry) => rankRowHtml(entry, colors, { self: Boolean(selfId && entry.id === selfId), winnerId }))
    .join("");
  const self = leaderboard.selfOverall;
  const selfFooter =
    self && self.rank !== 1 && !leaderboard.overall.some((entry) => entry.id === self.id)
      ? rankRowHtml(self, colors, { self: true, detached: true, winnerId })
      : "";
  return `
    <section class="se-panel se-standings">
      <h3 class="se-panel-title">Final Standings</h3>
      <ol class="se-rank-list">${rows}${selfFooter}</ol>
    </section>`;
};

const victoryGauges = (
  objectives: SeasonVictoryObjectiveView[],
  colors: ReadonlyMap<string, string>,
  selfId: string | undefined
): string => {
  if (objectives.length === 0) return "";
  const dials = objectives
    .map((objective) => {
      const isSelfLeader = Boolean(selfId && objective.leaderPlayerId === selfId);
      const leader = objective.leaderPlayerId
        ? playerBadge(objective.leaderPlayerId, isSelfLeader ? "You" : objective.leaderName, colors)
        : escapeHtml(objective.leaderName);
      const selfLine =
        objective.selfProgressLabel && !isSelfLeader
          ? `<p class="se-dial-self">You: ${escapeHtml(objective.selfProgressLabel)}</p>`
          : "";
      return `
      <article class="se-dial${objective.conditionMet ? " is-met" : ""}">
        <header class="se-dial-head">
          <span class="se-dial-name">${escapeHtml(objective.name)}</span>
          <span class="se-dial-status">${escapeHtml(objective.statusLabel)}</span>
        </header>
        <p class="se-dial-desc">${escapeHtml(objective.description)}</p>
        <p class="se-dial-leader">${leader} · ${escapeHtml(objective.progressLabel)}</p>${selfLine}
        <p class="se-dial-threshold">${escapeHtml(objective.thresholdLabel)}</p>
      </article>`;
    })
    .join("");
  return `
    <section class="se-panel se-victory">
      <h3 class="se-panel-title">Paths to Victory</h3>
      <div class="se-dials">${dials}</div>
    </section>`;
};

export const renderSeasonEndOverlay = (deps: SeasonEndOverlayDeps): void => {
  const { state, overlayEl, renderHud } = deps;
  if (deps.wsUrl) installLastContestRecapTriggers(state, { wsUrl: deps.wsUrl, renderHud });
  // The live season-end screen always wins over an archived recap, and closes
  // it so the stale recap doesn't reappear once the live one is dismissed.
  if (seasonEndVisible(state) && state.lastContestRecap.open) state.lastContestRecap = { ...state.lastContestRecap, open: false };
  if (seasonEndVisible(state) || !state.lastContestRecap.open) {
    renderSeasonEndPlate(deps);
    return;
  }
  const close = (): void => closeLastContestRecap(state, renderHud);
  const recapState = lastContestRecapOverlayState(state);
  if (recapState) {
    renderSeasonEndPlate({ ...deps, state: recapState, recap: { onClose: close } });
    return;
  }
  overlayEl.style.display = "grid";
  const signature = `recap-status:${state.lastContestRecap.load}`;
  if (overlayEl.dataset.seSignature === signature) return;
  overlayEl.dataset.seSignature = signature;
  overlayEl.innerHTML = lastContestRecapStatusHtml(state.lastContestRecap.load);
  const closeButton = overlayEl.querySelector("#se-recap-close") as HTMLButtonElement | null;
  if (closeButton) closeButton.onclick = close;
};

const renderSeasonEndPlate = (deps: SeasonEndPlateDeps): void => {
  const { state, overlayEl, renderHud, startNewSeason, forceStartNewSeason, openGuestSave, recap } = deps;
  const visible = seasonEndVisible(state);
  overlayEl.style.display = visible ? "grid" : "none";
  if (!visible || !state.seasonWinner) {
    if (overlayEl.innerHTML) {
      overlayEl.innerHTML = "";
      delete overlayEl.dataset.seSignature;
    }
    return;
  }

  const leaderboard: SeasonEndLeaderboard = state.leaderboard;
  // The live screen unseals every House's charges (client-house-charge-reveal.ts); the archived recap does not.
  if (!recap) ensureHouseChargeReveal(state, `${state.seasonWinner.playerId}:${state.seasonWinner.crownedAt}`, deps.wsUrl, renderHud);
  const signature = renderSignature(state, leaderboard, Boolean(recap));
  if (overlayEl.dataset.seSignature === signature) return;
  overlayEl.dataset.seSignature = signature;

  const colors = state.playerColors;
  const selfId = leaderboard.selfOverall?.id || state.me || undefined;
  const isSelfWinner = Boolean(selfId && state.seasonWinner.playerId === selfId);
  const empiresContested = leaderboard.overall.length;
  const starting = state.seasonEndStarting;
  const canForceStart = Boolean(state.mapRevealEligible && forceStartNewSeason) && !starting;
  // A disabled button gets no pointer events, so the admin's voted button
  // stays enabled (aria-disabled) to keep the long-press reachable.
  // While the next world builds, Houses that haven't committed can still join
  // (the gateway places late commits too); only committed Houses are done.
  const newSeasonDisabledAttr = state.seasonStartVoted && (starting || !canForceStart)
    ? "disabled"
    : state.seasonStartVoted ? `aria-disabled="true"` : "";
  const forceHoldAttrs = canForceStart ? `data-se-force-hold title="Admin: hold to start the next Sector Contest now"` : "";
  // Someone who never played this world (a newcomer arriving after the crown)
  // gets a short result card, not the full ledger.
  const compact = state.needsSeasonJoin;

  const winner = { ...state.seasonWinner,
    playerName: currentPlayerName(leaderboard, state.seasonWinner.playerId, state.seasonWinner.playerName) };
  const objectives = state.seasonVictory.map((objective) => ({
    ...objective,
    leaderName: currentPlayerName(leaderboard, objective.leaderPlayerId, objective.leaderName),
    statusLabel: objective.id === winner.objectiveId ? `Winner crowned: ${winner.playerName}` : objective.statusLabel
  }));
  const victoryHtml = victoryGauges(objectives, colors, selfId);
  const hasVictory = victoryHtml.length > 0;
  const seasonStats = state.seasonStats ?? state.seasonWinner.seasonStats;
  const scoreHistory = seasonEndScoreHistory(state)
    .map((series) => ({ ...series, playerName: currentPlayerName(leaderboard, series.playerId, series.playerName) }));
  const scoreGraphHtml = scoreGraphPanel(scoreHistory, colors, selfId, state.seasonWinner.playerId);
  const activeTab = overlayEl.dataset.seTab || "standings";

  overlayEl.innerHTML = `
    <div class="se-backdrop" id="se-backdrop" aria-hidden="true">
      <div class="se-cog se-cog-a" aria-hidden="true"></div>
      <div class="se-cog se-cog-b" aria-hidden="true"></div>
      <div class="se-cog se-cog-c" aria-hidden="true"></div>
    </div>
    <div class="se-plate" role="dialog" aria-modal="true" aria-labelledby="se-title">
      <div class="se-rivets" aria-hidden="true"></div>
      <div class="se-scroll">
        <div class="se-scroll-body">
          <header class="se-header">
            <span class="se-filigree se-filigree-l" aria-hidden="true"></span>
            <div class="se-header-text">
              <span class="se-kicker">${recap ? "Last Sector Contest" : "The Great Works Have Settled"}</span>
              <h2 id="se-title" class="se-title">Sector Contest Concluded</h2>
              <span class="se-subtitle">${empiresContested} ${empiresContested === 1 ? "empire" : "empires"} vied for the crown</span>
            </div>
            <span class="se-filigree se-filigree-r" aria-hidden="true"></span>
          </header>

          ${victorMedallion(winner, colors, isSelfWinner)}

          ${compact ? `<p class="se-arrival-note">You arrived after the crown was claimed. ${state.authIsGuest ? "Save your empire to join the next Sector Contest." : "Join the next Sector Contest to found your empire."}</p>
          ${standingsLedger({ ...leaderboard, overall: leaderboard.overall.slice(0, COMPACT_STANDINGS_ROWS), selfOverall: undefined }, colors, selfId, state.seasonWinner.playerId)}` : `<nav class="se-tab-bar" role="tablist">
            <button class="se-tab${activeTab === "standings" ? " is-active" : ""}" role="tab" data-tab="standings">Final Standings</button>
            ${hasVictory ? `<button class="se-tab${activeTab === "victory" ? " is-active" : ""}" role="tab" data-tab="victory">Victory Paths</button>` : ""}
            <button class="se-tab${activeTab === "misc" ? " is-active" : ""}" role="tab" data-tab="misc">Statistics</button>
            <button class="se-tab${activeTab === "score-graph" ? " is-active" : ""}" role="tab" data-tab="score-graph">Score Graph</button>
            ${recap ? "" : `<button class="se-tab${activeTab === "charges" ? " is-active" : ""}" role="tab" data-tab="charges">House Charges</button>`}
          </nav>
          <div class="se-tab-panels">
            <div class="se-tab-panel${activeTab === "standings" ? " is-active" : ""}" data-tab="standings" role="tabpanel">
              ${standingsLedger(leaderboard, colors, selfId, state.seasonWinner.playerId)}
            </div>
            ${hasVictory ? `<div class="se-tab-panel${activeTab === "victory" ? " is-active" : ""}" data-tab="victory" role="tabpanel">
              ${victoryHtml}
            </div>` : ""}
            <div class="se-tab-panel${activeTab === "misc" ? " is-active" : ""}" data-tab="misc" role="tabpanel">
              ${miscPanel(seasonStats, (id, name) => playerBadge(id, currentPlayerName(leaderboard, id, name ?? id), colors))}
            </div>
            <div class="se-tab-panel${activeTab === "score-graph" ? " is-active" : ""}" data-tab="score-graph" role="tabpanel">
              ${scoreGraphHtml}
            </div>
            ${recap ? "" : `<div class="se-tab-panel${activeTab === "charges" ? " is-active" : ""}" data-tab="charges" role="tabpanel">
              ${houseChargeRevealHtml(state.houseChargeReveal, (id, name) => playerBadge(id, currentPlayerName(leaderboard, id, name), colors), selfId)}
            </div>`}
          </div>`}
        </div>
        <div class="se-scroll-footer">
          ${recap ? `<footer class="se-actions">
            <button id="se-look-around" class="se-btn se-btn-secondary" type="button">Close</button>
          </footer>` : `<footer class="se-actions">
            <button id="se-new-season" class="se-btn se-btn-primary" type="button" ${newSeasonDisabledAttr} ${forceHoldAttrs}>
              ${canForceStart ? `<span class="se-btn-hold-fill" aria-hidden="true"></span>` : ""}
              <span class="se-btn-cog" aria-hidden="true"></span>
              <span class="se-btn-label">${escapeHtml(nextContestButtonLabel(state))}</span>
            </button>
            <button id="se-look-around" class="se-btn se-btn-secondary" type="button">Look Around</button>
          </footer>
          ${state.seasonStartError && !starting ? `<p class="se-start-error" role="alert">${escapeHtml(state.seasonStartError)}</p>` : ""}
          <p class="se-fineprint" aria-live="polite">${escapeHtml(nextContestFineprint(state.seasonStartVoteThreshold, starting, state.seasonStartVoted))}</p>`}
        </div>
      </div>
    </div>`;

  overlayEl.querySelectorAll<HTMLButtonElement>("[data-se-report-missing]").forEach((button) => {
    button.onclick = () => {
      const observation = button.closest(".se-missing-history")?.querySelector("p")?.textContent;
      setReportOpen("bug", true);
      renderHud();
      const description = document.querySelector<HTMLTextAreaElement>("#bug-report-overlay [data-bug-report-description]");
      // Preserve an existing draft if the player already started a report.
      if (!description || description.value.trim()) return;
      description.value = [
        `Contest summary is missing historical data: ${button.dataset.seMissingRecords}.`,
        observation ? `Observed: ${observation}` : "",
        `Winner: ${winner.playerId} (${winner.playerName}).`,
        `Crowned: ${new Date(winner.crownedAt).toISOString()}.`,
        "Please investigate why these Sector Contest records are unavailable."
      ].filter(Boolean).join("\n");
      description.dispatchEvent(new Event("input", { bubbles: true }));
      description.focus();
    };
  });

  const lookAround = overlayEl.querySelector("#se-look-around") as HTMLButtonElement | null;
  const newSeason = overlayEl.querySelector("#se-new-season") as HTMLButtonElement | null;

  if (lookAround) {
    lookAround.onclick = () => {
      if (recap) { recap.onClose(); return; }
      state.seasonEndDismissed = true;
      renderHud();
    };
  }
  if (newSeason) {
    newSeason.onclick = () => {
      if (consumeForceHoldClick(newSeason)) return;
      if (state.seasonStartVoted) return;
      if (state.authIsGuest) { openGuestSave?.(); return; }
      state.seasonStartError = undefined;
      startNewSeason();
    };
    if (canForceStart && forceStartNewSeason) {
      // Show the start straight away: the world build takes a while and the
      // gateway's "starting" broadcast confirms it (or an ERROR reverts it).
      attachSeasonForceHold(newSeason, { onForce: () => {
        // Not sent (socket down / signed out): don't claim a start is under way.
        if (!forceStartNewSeason()) return;
        state.seasonEndStarting = true;
        state.seasonStartError = undefined;
        renderHud();
      } });
    }
  }

  const tabBar = overlayEl.querySelector(".se-tab-bar") as HTMLElement | null;
  if (tabBar) {
    tabBar.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement).closest(".se-tab") as HTMLElement | null;
      if (!tab || tab.classList.contains("is-active")) return;
      const tabId = tab.dataset.tab;
      if (!tabId) return;
      tabBar.querySelectorAll(".se-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      overlayEl.querySelectorAll(".se-tab-panel").forEach((p) => p.classList.remove("is-active"));
      const panel = overlayEl.querySelector(`.se-tab-panel[data-tab="${tabId}"]`);
      if (panel) panel.classList.add("is-active");
      overlayEl.dataset.seTab = tabId;
    });
  }

  if (!overlayEl.dataset.seWheelReady) {
    overlayEl.dataset.seWheelReady = "1";
    const preventOutsideScroll = (e: Event) => {
      const body = overlayEl.querySelector(".se-scroll-body");
      if (body && body.contains(e.target as Node)) {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    overlayEl.addEventListener("wheel", preventOutsideScroll as EventListener, { passive: false });
    overlayEl.addEventListener("touchmove", preventOutsideScroll as EventListener, { passive: false });
  }
};
