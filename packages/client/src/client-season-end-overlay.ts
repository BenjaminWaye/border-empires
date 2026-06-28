import type { ClientState } from "./client-state/client-state.js";
import type {
  LeaderboardOverallEntry,
  LeaderboardMetricEntry,
  SeasonVictoryObjectiveView,
  SeasonWinnerView
} from "./client-types.js";

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
    "me" | "seasonWinner" | "leaderboard" | "seasonVictory" | "seasonEndDismissed" | "seasonEndStarting" | "playerColors"
  >;
  overlayEl: HTMLDivElement;
  renderHud: () => void;
  startNewSeason: () => void;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );

const safeColorValue = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : undefined;
};

const playerBadge = (
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

const rankGlyph = (rank: number, isWinner: boolean): string => isWinner ? "♔" : `${rank}`;

const num = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const seasonEndVisible = (state: SeasonEndOverlayDeps["state"]): boolean =>
  Boolean(state.seasonWinner) && !state.seasonEndDismissed;

// renderClientHud runs on every state tick; post-season the player is parked on
// the frozen map and the HUD still re-renders on feed/status updates. Rebuilding
// the overlay innerHTML each time is wasteful and restarts the cog/crown CSS
// animations (visible stutter). Skip the rebuild unless the rendered inputs
// actually changed, keyed by this signature.
const renderSignature = (state: SeasonEndOverlayDeps["state"], leaderboard: SeasonEndLeaderboard): string =>
  JSON.stringify({
    winner: state.seasonWinner?.playerId,
    objective: state.seasonWinner?.objectiveName,
    starting: state.seasonEndStarting,
    self: leaderboard.selfOverall?.id,
    overall: leaderboard.overall.map((e) => [e.id, e.rank, e.score, e.tiles, e.incomePerMinute, e.techs]),
    victory: state.seasonVictory.map((o) => [o.id, o.statusLabel, o.leaderPlayerId, o.progressLabel, o.conditionMet])
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
  const isWinner = Boolean(options.winnerId && entry.id === options.winnerId);
  const medalClass = options.detached ? "" : rankClass(entry.rank);
  const glyph = options.detached ? `${entry.rank}` : rankGlyph(entry.rank, isWinner);
  return `
    <li class="se-rank-row${options.self ? " is-self" : ""}${options.detached ? " is-detached" : ""}">
      <span class="se-rank-medal ${medalClass}">${glyph}</span>
      <span class="se-rank-name">${playerBadge(entry.id, options.self ? "You" : entry.name, colors)}</span>
      <span class="se-rank-stats">
        <span class="se-gauge" title="Final score"><em>${num(entry.score, 1)}</em><span>score</span></span>
        <span class="se-gauge" title="Settled tiles"><em>${num(entry.tiles)}</em><span>tiles</span></span>
        <span class="se-gauge" title="Income / min"><em>${num(entry.incomePerMinute, 1)}</em><span>gold/m</span></span>
        <span class="se-gauge" title="Technologies"><em>${num(entry.techs)}</em><span>tech</span></span>
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
  // Skip the rebuild (and animation restart) when nothing rendered has changed.
  const signature = renderSignature(state, leaderboard);
  if (overlayEl.dataset.seSignature === signature) return;
  overlayEl.dataset.seSignature = signature;

  const colors = state.playerColors;
  const selfId = leaderboard.selfOverall?.id || state.me || undefined;
  const isSelfWinner = Boolean(selfId && state.seasonWinner.playerId === selfId);
  const empiresContested = leaderboard.overall.length;
  const starting = state.seasonEndStarting;

  overlayEl.innerHTML = `
    <div class="se-backdrop" id="se-backdrop" aria-hidden="true">
      <div class="se-cog se-cog-a" aria-hidden="true"></div>
      <div class="se-cog se-cog-b" aria-hidden="true"></div>
      <div class="se-cog se-cog-c" aria-hidden="true"></div>
    </div>
    <div class="se-plate" role="dialog" aria-modal="true" aria-labelledby="se-title">
      <div class="se-rivets" aria-hidden="true"></div>
      <div class="se-scroll">
        <header class="se-header">
          <span class="se-filigree se-filigree-l" aria-hidden="true"></span>
          <div class="se-header-text">
            <span class="se-kicker">The Great Works Have Settled</span>
            <h2 id="se-title" class="se-title">Season Concluded</h2>
            <span class="se-subtitle">${empiresContested} ${empiresContested === 1 ? "empire" : "empires"} vied for the crown</span>
          </div>
          <span class="se-filigree se-filigree-r" aria-hidden="true"></span>
        </header>

        ${victorMedallion(state.seasonWinner, colors, isSelfWinner)}
        ${standingsLedger(leaderboard, colors, selfId, state.seasonWinner.playerId)}
        ${victoryGauges(state.seasonVictory, colors, selfId)}

        <footer class="se-actions">
          <button id="se-new-season" class="se-btn se-btn-primary" type="button" ${starting ? "disabled" : ""}>
            <span class="se-btn-cog" aria-hidden="true"></span>
            ${starting ? "Winding the Spring…" : "Start New Season"}
          </button>
          <button id="se-look-around" class="se-btn se-btn-secondary" type="button">Look Around</button>
        </footer>
        <p class="se-fineprint">Starting a new season resets the world and progression for <strong>every</strong> player.</p>
      </div>
    </div>`;

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
      if (state.seasonEndStarting) return;
      const ok = window.confirm(
        "Start a new season for EVERYONE? This resets the world and all progression for every player."
      );
      if (!ok) return;
      state.seasonEndStarting = true;
      startNewSeason();
      renderHud();
    };
  }
};
