import { formatHoldCountdown } from "../client-victory-alert/client-victory-alert.js";
import { lastContestRecapButtonHtml } from "../client-last-contest-recap/client-last-contest-recap.js";
import { foundingEngineerNameHtml } from "../client-founding-engineer/client-founding-engineer.js";
import { dukeNameHtml } from "../client-duke-title/client-duke-title.js";
import { resourceGlyphsToIconHtml } from "../client-resource-icons/client-resource-icons.js";
import type {
  FeedEntry,
  FeedType,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
} from "../client-types.js";

// Activity Feed entries persist across a session (up to 18, see pushFeed/
// pushFeedEntry), so their age can run from seconds to months — unlike the
// short-lived UI elsewhere that only ever needs s/m/h. Scales through
// weeks and months (30-day) rather than showing raw minutes forever.
export const feedAgeLabel = (atMs: number, nowMs: number): string => {
  const ageSec = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  if (ageSec < 60) return `${ageSec}s`;
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m`;
  const ageHours = Math.floor(ageMin / 60);
  if (ageHours < 24) return `${ageHours}h`;
  const ageDays = Math.floor(ageHours / 24);
  if (ageDays < 7) return `${ageDays}d`;
  const ageWeeks = Math.floor(ageDays / 7);
  if (ageDays < 30) return `${ageWeeks}w`;
  const ageMonths = Math.floor(ageDays / 30);
  return `${ageMonths}mo`;
};

const feedIcon = (type: FeedType): string => {
  if (type === "combat") return "⚔";
  if (type === "mission") return "✓";
  if (type === "alliance") return "⚖\uFE0E";
  if (type === "tech") return "ϟ";
  if (type === "error") return "!";
  return "i";
};

type FeedDebugControls = {
  visible: boolean;
  enabled: boolean;
  selectedTileKey?: string | undefined;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const safePlayerColor = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : undefined;
};

const playerDotHtml = (playerId: string | undefined, playerColors: ReadonlyMap<string, string>): string => {
  const safeColor = safePlayerColor(playerId ? playerColors.get(playerId) : undefined);
  return `<span class="lb-player-dot${safeColor ? "" : " is-unknown"}"${safeColor ? ` style="--player-color:${safeColor}"` : ""} aria-hidden="true"></span>`;
};

const playerNameBadgeHtml = (
  playerId: string | undefined,
  playerName: string,
  playerColors: ReadonlyMap<string, string>,
  dukePlayers: ReadonlySet<string> = new Set()
): string => {
  const clickAttr = playerId ? ` data-player-name-id="${escapeHtml(playerId)}"` : "";
  const isDuke = Boolean(playerId && dukePlayers.has(playerId));
  return `<span class="lb-player-name"${clickAttr}>${playerDotHtml(playerId, playerColors)}<span${clickAttr ? ` class="player-name-text"` : ""}>${dukeNameHtml(foundingEngineerNameHtml(escapeHtml(playerName), playerId), isDuke)}</span></span>`;
};

const feedDebugControlsHtml = (controls: FeedDebugControls): string => {
  if (!controls.visible) return "";
  const targetLabel = controls.selectedTileKey ?? "No tile selected";
  const statusLabel = controls.enabled ? `Logging ${targetLabel} and neighbors.` : "Off until you start it.";
  return `<article class="card feed-card debug-feed-card severity-info">
    <div class="feed-icon">⌘</div>
    <div>
      <strong>Admin Tile Debug</strong>
      <div>${statusLabel}</div>
      <span>Target: ${targetLabel}</span>
      <div class="debug-feed-actions">
        <button class="panel-btn" type="button" data-debug-tile-toggle="1" ${!controls.enabled && !controls.selectedTileKey ? "disabled" : ""}>
          ${controls.enabled ? "Stop Tile Debug" : "Debug Selected Tile"}
        </button>
      </div>
    </div>
  </article>`;
};

export const feedHtml = (feed: FeedEntry[], debugControls?: FeedDebugControls): string => {
  const debugCard = feedDebugControlsHtml(debugControls ?? { visible: false, enabled: false });
  if (feed.length === 0) return `${debugCard}<article class="card"><p>No activity yet.</p></article>`;
  return `${debugCard}${feed
    .map((entry) => {
      return `<article class="card feed-card severity-${entry.severity}${entry.unread ? " feed-card--unread" : ""}">
        <div class="feed-icon">${feedIcon(entry.type)}</div>
        <div>
          ${entry.title ? `<strong>${entry.title}</strong>` : ""}
          <div>${resourceGlyphsToIconHtml(entry.text)}</div>
          <span>${feedAgeLabel(entry.at, Date.now())} ago</span>
          ${
            typeof entry.focusX === "number" && typeof entry.focusY === "number"
              ? `<div><button class="panel-btn" type="button" data-feed-focus-x="${entry.focusX}" data-feed-focus-y="${entry.focusY}">${entry.actionLabel ?? "Center"}</button></div>`
              : ""
          }
        </div>
      </article>`;
    })
    .join("")}`;
};

// Shared with client-player-profile.ts, which needs the same "who is the
// viewer" resolution to identify a self-profile.
export const selfPlayerIdFromLeaderboard = (leaderboard: {
  selfOverall?: { id: string } | undefined;
  selfByTiles?: { id: string } | undefined;
  selfByIncome?: { id: string } | undefined;
  selfByTechs?: { id: string } | undefined;
}): string | undefined =>
  leaderboard.selfOverall?.id ?? leaderboard.selfByTiles?.id ?? leaderboard.selfByIncome?.id ?? leaderboard.selfByTechs?.id;

export const socialRemainingLabel = (untilMs: number, nowMs: number): string => {
  const remainingMs = Math.max(0, untilMs - nowMs);
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (remainingMinutes < 60) return `${remainingMinutes}m`;
  // Whole hours are floored with the leftover minutes shown, so 1h 23m left
  // reads "1h 23m" instead of being rounded up to "2h".
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

export const missionCardsHtml = (missions: MissionState[]): string =>
  missions.length === 0
    ? `<article class="card"><p>Missions are paused for rebalance.</p></article>`
    : missions
        .map((mission) => {
          const pct = Math.min(100, Math.floor((mission.progress / Math.max(1, mission.target)) * 100));
          const status = mission.claimed ? "Claimed" : mission.completed ? "Completed" : `${mission.progress}/${mission.target}`;
          const expiresText =
            typeof mission.expiresAt === "number"
              ? (() => {
                  const ms = Math.max(0, mission.expiresAt - Date.now());
                  const h = Math.floor(ms / 3_600_000);
                  const d = Math.floor(h / 24);
                  if (d > 0) return `Expires in ${d}d ${h % 24}h`;
                  return `Expires in ${h}h`;
                })()
              : "";
          return `<article class="card mission-card">
        <div class="mission-top"><strong>${mission.name}</strong><span class="chip">${status}</span></div>
        <p>${mission.description}</p>
        ${expiresText ? `<p class="muted">${expiresText}</p>` : ""}
        <div class="progress"><div style="width:${pct}%"></div></div>
        <div class="mission-reward">${mission.rewardLabel ?? `Reward +${mission.rewardPoints} Coin`}</div>
      </article>`;
        })
        .join("");

export const leaderboardHtml = (
  leaderboard: {
    overall: LeaderboardOverallEntry[];
    selfOverall: LeaderboardOverallEntry | undefined;
    selfByTiles: LeaderboardMetricEntry | undefined;
    selfByIncome: LeaderboardMetricEntry | undefined;
    selfByTechs: LeaderboardMetricEntry | undefined;
    byTiles: LeaderboardMetricEntry[];
    byIncome: LeaderboardMetricEntry[];
    byTechs: LeaderboardMetricEntry[];
  },
  seasonVictory: SeasonVictoryObjectiveView[],
  seasonWinner: SeasonWinnerView | null | undefined,
  playerColors: ReadonlyMap<string, string> = new Map(),
  dukePlayers: ReadonlySet<string> = new Set()
): string => {
  const overallLineText = (entry: LeaderboardOverallEntry): string =>
    `${entry.name} | score ${entry.score.toFixed(1)} | garrisoned tiles ${entry.tiles} | income ${entry.incomePerMinute.toFixed(1)} | manifests ${entry.techs} | manpower cap ${entry.manpowerCap}`;
  const overallLineHtml = (entry: LeaderboardOverallEntry): string =>
    `${playerNameBadgeHtml(entry.id, entry.name, playerColors, dukePlayers)} | score ${entry.score.toFixed(1)} | garrisoned tiles ${entry.tiles} | income ${(entry.incomePerMinute * 1440).toFixed(1)}/day | manifests ${entry.techs} | manpower cap ${entry.manpowerCap}`;
  const metricLineText = (entry: LeaderboardMetricEntry): string => `${entry.name} (${entry.value.toFixed(1)})`;
  const metricLineHtml = (entry: LeaderboardMetricEntry): string => `${playerNameBadgeHtml(entry.id, entry.name, playerColors, dukePlayers)} (${entry.value.toFixed(1)})`;
  const includesOverallEntry = (entries: LeaderboardOverallEntry[], selfEntry: LeaderboardOverallEntry | undefined): boolean => {
    if (!selfEntry) return false;
    return entries.some((entry) => entry.id === selfEntry.id || (entry.rank === selfEntry.rank && overallLineText(entry) === overallLineText(selfEntry)));
  };
  const includesMetricEntry = (entries: LeaderboardMetricEntry[], selfEntry: LeaderboardMetricEntry | undefined): boolean => {
    if (!selfEntry) return false;
    return entries.some((entry) => entry.id === selfEntry.id || (entry.rank === selfEntry.rank && metricLineText(entry) === metricLineText(selfEntry)));
  };
  const selfPlayerId = selfPlayerIdFromLeaderboard(leaderboard);
  const isSelfPlayer = (playerId: string | undefined): boolean => Boolean(playerId && selfPlayerId && playerId === selfPlayerId);
  const shouldShowSelfProgress = (objective: SeasonVictoryObjectiveView): boolean =>
    Boolean(objective.selfProgressLabel) && !isSelfPlayer(objective.leaderPlayerId);
  const objectiveLeaderHtml = (objective: SeasonVictoryObjectiveView): string =>
    objective.leaderPlayerId ? playerNameBadgeHtml(objective.leaderPlayerId, isSelfPlayer(objective.leaderPlayerId) ? "You" : objective.leaderName, playerColors, dukePlayers) : escapeHtml(objective.leaderName);
  const metricRows = (entries: LeaderboardMetricEntry[], selfEntry: LeaderboardMetricEntry | undefined): string =>
    `${entries.map((entry) => `<div class="lb-row">${entry.rank}. ${metricLineHtml(entry)}</div>`).join("")}${
      selfEntry && selfEntry.rank !== 1 && !includesMetricEntry(entries, selfEntry)
        ? `<div class="lb-row">${selfEntry.rank}. ${playerNameBadgeHtml(selfEntry.id, "You", playerColors, dukePlayers)} (${selfEntry.value.toFixed(1)})</div>`
        : ""
    }`;
  const winnerCard = seasonWinner
    ? `
    <article class="card pressure-card">
      <strong>Contest Winner</strong>
      <div class="pressure-row">
        <div class="pressure-head">
          <span class="pressure-name">${playerNameBadgeHtml(seasonWinner.playerId, isSelfPlayer(seasonWinner.playerId) ? "You" : seasonWinner.playerName, playerColors, dukePlayers)}</span>
          <span class="pressure-status is-hot">Crowned</span>
        </div>
        <div class="pressure-meta">${seasonWinner.objectiveName}</div>
        <div class="pressure-meta">${new Date(seasonWinner.crownedAt).toLocaleString()}</div>
      </div>
    </article>`
    : "";
  const pressureCards =
    seasonVictory.length > 0
      ? `
    <article class="card pressure-card">
      <strong>Contest Victory</strong>
      ${seasonVictory
        .map(
          (objective) => `<div class="pressure-row">
            <div class="pressure-head">
              <span class="pressure-name">${objective.name}</span>
              <span class="pressure-status ${objective.conditionMet ? "is-hot" : ""}">${objective.statusLabel}</span>
            </div>
            <div class="pressure-meta">${objective.description}</div>
            <div class="pressure-meta">Leader: ${objectiveLeaderHtml(objective)} · ${objective.progressLabel}</div>
            ${shouldShowSelfProgress(objective) ? `<div class="pressure-meta">You: ${objective.selfProgressLabel}</div>` : ""}
            <div class="pressure-meta">${objective.thresholdLabel}</div>
            ${
              typeof objective.holdRemainingSeconds === "number"
                ? `<div class="pressure-meta pressure-meta-countdown">Winning in ${formatHoldCountdown(objective.holdRemainingSeconds)} unless stopped</div>`
                : ""
            }
          </div>`
        )
        .join("")}
    </article>`
      : "";
  return `
    ${winnerCard}
    ${pressureCards}
    <article class="card">
      <strong>Overall</strong>
      ${leaderboard.overall.map((entry) => `<div class="lb-row">${entry.rank}. ${overallLineHtml(entry)}</div>`).join("")}
      ${
        leaderboard.selfOverall && leaderboard.selfOverall.rank !== 1 && !includesOverallEntry(leaderboard.overall, leaderboard.selfOverall)
          ? `<div class="lb-row">${leaderboard.selfOverall.rank}. ${playerNameBadgeHtml(leaderboard.selfOverall.id, "You", playerColors, dukePlayers)} | score ${leaderboard.selfOverall.score.toFixed(1)} | garrisoned tiles ${leaderboard.selfOverall.tiles} | income ${(leaderboard.selfOverall.incomePerMinute * 1440).toFixed(1)}/day | manifests ${leaderboard.selfOverall.techs} | manpower cap ${leaderboard.selfOverall.manpowerCap}</div>`
          : ""
      }
    </article>
    <article class="card">
      <strong>Most Garrisoned Tiles</strong>
      ${metricRows(leaderboard.byTiles, leaderboard.selfByTiles)}
    </article>
    <article class="card">
      <strong>Most Income</strong>
      ${metricRows(leaderboard.byIncome, leaderboard.selfByIncome)}
    </article>
    <article class="card">
      <strong>Most Manifests</strong>
      ${metricRows(leaderboard.byTechs, leaderboard.selfByTechs)}
    </article>
    <article class="card last-contest-recap-card">
      <strong>${seasonWinner ? "Contest Recap" : "Last Sector Contest"}</strong>
      ${lastContestRecapButtonHtml(seasonWinner ? "View Contest Recap" : "Last Contest Recap")}
    </article>
  `;
};
