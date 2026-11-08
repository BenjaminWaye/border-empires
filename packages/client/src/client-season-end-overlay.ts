import type { ClientState } from "./client-state/client-state.js";
import type {
  LeaderboardOverallEntry,
  LeaderboardMetricEntry,
  SeasonStatsView,
  SeasonVictoryObjectiveView,
  SeasonWinnerView
} from "./client-types.js";
import { setReportOpen } from "./client-bug-report/client-bug-report.js";
import { scoreGraphPanel } from "./client-season-end-score-graph.js";

type SeasonEndLeaderboard = {
  overall: LeaderboardOverallEntry[];
  selfOverall: LeaderboardOverallEntry | undefined;
  byTiles: LeaderboardMetricEntry[];
  byIncome: LeaderboardMetricEntry[];
  byTechs: LeaderboardMetricEntry[];
};

type SeasonEndOverlayDeps = {
  state: Pick<
    ClientState,
    | "me"
    | "seasonWinner"
    | "leaderboard"
    | "seasonVictory"
    | "seasonStats"
    | "seasonScoreHistory"
    | "seasonEndDismissed"
    | "seasonEndStarting"
    | "seasonStartVoteCount"
    | "seasonStartVoted"
    | "playerColors"
  >;
  overlayEl: HTMLDivElement;
  renderHud: () => void;
  startNewSeason: () => void;
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );

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

const rankClass = (rank: number): string =>
  rank === 1 ? "is-gold" : rank === 2 ? "is-silver" : rank === 3 ? "is-bronze" : "";

const num = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const seasonEndVisible = (state: SeasonEndOverlayDeps["state"]): boolean =>
  Boolean(state.seasonWinner) && !state.seasonEndDismissed;

const renderSignature = (state: SeasonEndOverlayDeps["state"], leaderboard: SeasonEndLeaderboard): string =>
  JSON.stringify({
    winner: [state.seasonWinner?.playerId, state.seasonWinner?.playerName, state.seasonWinner?.crownedAt],
    objective: state.seasonWinner?.objectiveName,
    starting: state.seasonEndStarting,
    voteCount: state.seasonStartVoteCount,
    voted: state.seasonStartVoted,
    self: leaderboard.selfOverall?.id,
    overall: leaderboard.overall.map((e) => [e.id, e.name, e.rank, e.score, e.tiles, e.incomePerMinute, e.techs]),
    victory: state.seasonVictory.map((o) => [o.id, o.statusLabel, o.leaderPlayerId, o.progressLabel, o.conditionMet]),
    stats: state.seasonStats ?? state.seasonWinner?.seasonStats,
    // Cheap-but-sufficient signature for a per-player time series: point
    // count + last value catches "a new sample arrived" without hashing the
    // whole (small, capped) series every render.
    scoreHistory: (state.seasonScoreHistory.length > 0 ? state.seasonScoreHistory : state.seasonWinner?.scoreHistory ?? [])
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
      <span class="se-victor-kicker">Season Victor</span>
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
  const crown = isWinner ? `<span class="se-rank-crown" title="Season Victor" aria-hidden="true">♔</span>` : "";
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

const missingHistoryReportButton = (section: "statistics" | "timeline", missing: string[]): string =>
  `<button type="button" class="se-btn se-btn-secondary" data-se-report-missing="${section}" data-se-missing-records="${escapeHtml(missing.join(", "))}">Report a bug</button>`;

const miscPanel = (
  stats: SeasonStatsView | undefined,
  colors: ReadonlyMap<string, string>,
  leaderboard: SeasonEndLeaderboard
): string => {
  const items: string[] = [];
  const missing: string[] = [];
  const namedPlayer = (id: string, name: string | undefined): string => {
    const current = leaderboard.overall.find((entry) => entry.id === id)
      ?? (leaderboard.selfOverall?.id === id ? leaderboard.selfOverall : undefined);
    return playerBadge(id, current?.name ?? name ?? id, colors);
  };
  const deadly = stats?.mostDeadlyTile;
  const road = stats?.longestRoad;
  if (deadly) {
    const player = deadly.mostLossesPlayer;
    items.push(`<div class="se-misc-item">
      <span class="se-misc-label">Most Deadly Tile</span>
      <span class="se-misc-value"><strong>${num(deadly.manpowerLost)}</strong> manpower lost on tile (${deadly.x}, ${deadly.y})<br>
      ${player ? `Most losses: ${namedPlayer(player.playerId, player.playerName)} · <strong>${num(player.manpowerLost)}</strong> manpower` : "Player loss history unavailable."}</span>
    </div>`);
    if (!player) missing.push("Deadliest tile player losses");
  } else {
    items.push(`<div class="se-misc-item"><span class="se-misc-label">Most Deadly Tile</span><span class="se-misc-value">No combat record available.</span></div>`);
    missing.push("Most Deadly Tile");
  }
  if (road) {
    const hasDetails = road.playerId && road.fromCity && road.toCity;
    const city = (value: NonNullable<typeof road.fromCity>): string => `${escapeHtml(value.name)} (${value.x}, ${value.y})`;
    items.push(`<div class="se-misc-item">
      <span class="se-misc-label">Longest Road</span>
      <span class="se-misc-value">${road.playerId ? `${namedPlayer(road.playerId, road.playerName)} · ` : ""}<strong>${num(road.tileCount)}</strong> tiles long<br>
      ${road.fromCity && road.toCity ? `${city(road.fromCity)} ↔ ${city(road.toCity)}` : "City details unavailable."}</span>
    </div>`);
    if (!hasDetails) missing.push("Longest Road owner and cities");
  } else {
    items.push(`<div class="se-misc-item"><span class="se-misc-label">Longest Road</span><span class="se-misc-value">No connected road recorded.</span></div>`);
    missing.push("Longest Road");
  }
  return `<section class="se-panel se-misc">
    <h3 class="se-panel-title">Season Miscellany</h3>
    <div class="se-misc-items">${items.join("")}</div>
    ${missing.length > 0 ? missingHistoryReportButton("statistics", missing) : ""}
  </section>`;
};

export const renderSeasonEndOverlay = (deps: SeasonEndOverlayDeps): void => {
  const { state, overlayEl, renderHud, startNewSeason } = deps;
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
  const signature = renderSignature(state, leaderboard);
  if (overlayEl.dataset.seSignature === signature) return;
  overlayEl.dataset.seSignature = signature;

  const colors = state.playerColors;
  const selfId = leaderboard.selfOverall?.id || state.me || undefined;
  const isSelfWinner = Boolean(selfId && state.seasonWinner.playerId === selfId);
  const empiresContested = leaderboard.overall.length;
  const starting = state.seasonEndStarting;

  const victoryHtml = victoryGauges(state.seasonVictory, colors, selfId);
  const hasVictory = victoryHtml.length > 0;
  const seasonStats = state.seasonStats ?? state.seasonWinner.seasonStats;
  const scoreHistory = state.seasonScoreHistory.length > 0 ? state.seasonScoreHistory : state.seasonWinner.scoreHistory ?? [];
  const scoreGraphHtml = scoreGraphPanel(scoreHistory, colors, selfId, state.seasonWinner.playerId)
    || `<section class="se-panel se-graph"><h3 class="se-panel-title">Score Over Time</h3><p>No score timeline was saved for this season.</p>${missingHistoryReportButton("timeline", ["Score timeline"])}</section>`;
  const winnerEntry = leaderboard.overall.find((entry) => entry.id === state.seasonWinner?.playerId)
    ?? (leaderboard.selfOverall?.id === state.seasonWinner.playerId ? leaderboard.selfOverall : undefined);
  const winner = { ...state.seasonWinner, playerName: winnerEntry?.name ?? state.seasonWinner.playerName };
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
              <span class="se-kicker">The Great Works Have Settled</span>
              <h2 id="se-title" class="se-title">Season Concluded</h2>
              <span class="se-subtitle">${empiresContested} ${empiresContested === 1 ? "empire" : "empires"} vied for the crown</span>
            </div>
            <span class="se-filigree se-filigree-r" aria-hidden="true"></span>
          </header>

          ${victorMedallion(winner, colors, isSelfWinner)}

          <nav class="se-tab-bar" role="tablist">
            <button class="se-tab${activeTab === "standings" ? " is-active" : ""}" role="tab" data-tab="standings">Final Standings</button>
            ${hasVictory ? `<button class="se-tab${activeTab === "victory" ? " is-active" : ""}" role="tab" data-tab="victory">Victory Paths</button>` : ""}
            <button class="se-tab${activeTab === "misc" ? " is-active" : ""}" role="tab" data-tab="misc">Statistics</button>
            <button class="se-tab${activeTab === "score-graph" ? " is-active" : ""}" role="tab" data-tab="score-graph">Score Graph</button>
          </nav>
          <div class="se-tab-panels">
            <div class="se-tab-panel${activeTab === "standings" ? " is-active" : ""}" data-tab="standings" role="tabpanel">
              ${standingsLedger(leaderboard, colors, selfId, state.seasonWinner.playerId)}
            </div>
            ${hasVictory ? `<div class="se-tab-panel${activeTab === "victory" ? " is-active" : ""}" data-tab="victory" role="tabpanel">
              ${victoryHtml}
            </div>` : ""}
            <div class="se-tab-panel${activeTab === "misc" ? " is-active" : ""}" data-tab="misc" role="tabpanel">
              ${miscPanel(seasonStats, colors, leaderboard)}
            </div>
            <div class="se-tab-panel${activeTab === "score-graph" ? " is-active" : ""}" data-tab="score-graph" role="tabpanel">
              ${scoreGraphHtml}
            </div>
          </div>
        </div>
        <div class="se-scroll-footer">
          <footer class="se-actions">
            <button id="se-new-season" class="se-btn se-btn-primary" type="button" ${starting || state.seasonStartVoted ? "disabled" : ""}>
              <span class="se-btn-cog" aria-hidden="true"></span>
              ${starting ? "Winding the Spring…" : state.seasonStartVoted ? `Vote cast (${state.seasonStartVoteCount}/5)` : "Vote for New Season"}
            </button>
            <button id="se-look-around" class="se-btn se-btn-secondary" type="button">Look Around</button>
          </footer>
          <p class="se-fineprint">Starting a new season resets the world and progression for <strong>every</strong> player.</p>
        </div>
      </div>
    </div>`;

  overlayEl.querySelectorAll<HTMLButtonElement>("[data-se-report-missing]").forEach((button) => {
    button.onclick = () => {
      setReportOpen("bug", true);
      renderHud();
      const description = document.querySelector<HTMLTextAreaElement>("#bug-report-overlay [data-bug-report-description]");
      // Preserve an existing draft if the player already started a report.
      if (!description || description.value.trim()) return;
      description.value = `Season summary is missing historical data: ${button.dataset.seMissingRecords}.\nWinner: ${winner.playerId} (${winner.playerName}).\nCrowned: ${new Date(winner.crownedAt).toISOString()}.\nPlease investigate why these season records are unavailable.`;
      description.dispatchEvent(new Event("input", { bubbles: true }));
      description.focus();
    };
  });

  const lookAround = overlayEl.querySelector("#se-look-around") as HTMLButtonElement | null;
  const newSeason = overlayEl.querySelector("#se-new-season") as HTMLButtonElement | null;

  if (lookAround) {
    lookAround.onclick = () => {
      state.seasonEndDismissed = true;
      renderHud();
    };
  }
  if (newSeason) {
    newSeason.onclick = () => {
      if (state.seasonEndStarting || state.seasonStartVoted) return;
      startNewSeason();
    };
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
