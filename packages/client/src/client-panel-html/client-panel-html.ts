import { formatHoldCountdown } from "../client-victory-alert/client-victory-alert.js";
import type {
  ActiveTruceView,
  ActiveAllianceBreakView,
  AllianceRequest,
  FeedEntry,
  FeedType,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
  TruceRequest
} from "../client-types.js";

const feedIcon = (type: FeedType): string => {
  if (type === "combat") return "⚔";
  if (type === "mission") return "✓";
  if (type === "alliance") return "🤝";
  if (type === "tech") return "⚡";
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

const playerNameBadgeHtml = (playerId: string | undefined, playerName: string, playerColors: ReadonlyMap<string, string>): string => {
  const safeColor = safePlayerColor(playerId ? playerColors.get(playerId) : undefined);
  return `<span class="lb-player-name"><span class="lb-player-dot${safeColor ? "" : " is-unknown"}"${safeColor ? ` style="--player-color:${safeColor}"` : ""} aria-hidden="true"></span><span>${escapeHtml(playerName)}</span></span>`;
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
      const ageSec = Math.floor((Date.now() - entry.at) / 1000);
      const age = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
      return `<article class="card feed-card severity-${entry.severity}">
        <div class="feed-icon">${feedIcon(entry.type)}</div>
        <div>
          ${entry.title ? `<strong>${entry.title}</strong>` : ""}
          <div>${entry.text}</div>
          <span>${age} ago</span>
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

const socialRelativeAgeLabel = (fromMs: number, nowMs: number): string => {
  const diffMs = Math.max(0, nowMs - fromMs);
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes >= 60 * 24) return `${Math.floor(diffMinutes / (60 * 24))}d ago`;
  if (diffMinutes >= 60) return `${Math.floor(diffMinutes / 60)}h ago`;
  return `${diffMinutes}m ago`;
};

const socialRemainingLabel = (untilMs: number, nowMs: number): string => {
  const remainingMs = Math.max(0, untilMs - nowMs);
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (remainingMinutes >= 60) return `${Math.ceil(remainingMinutes / 60)}h`;
  return `${remainingMinutes}m`;
};

const socialPlayerIdLabel = (playerId: string): string => `ID: ${playerId.length > 12 ? playerId.slice(0, 8) : playerId}`;

const socialClockIcon = (): string => '<span class="alliance-inline-icon alliance-inline-icon-clock" aria-hidden="true">◷</span>';

const socialCheckIcon = (): string => '<span class="alliance-inline-icon alliance-inline-icon-check" aria-hidden="true">✓</span>';

const socialBreakIcon = (): string => '<span class="alliance-inline-icon alliance-inline-icon-break" aria-hidden="true">!</span>';

const socialMetaLineHtml = (sentBy: string, waitingOn: string): string =>
  `<div class="alliance-reference-meta">
    <span class="alliance-reference-meta-label">Sent by:</span>
    <span class="alliance-reference-meta-sender">${sentBy}</span>
    <span class="alliance-reference-meta-sep">•</span>
    <span class="alliance-reference-meta-label">Waiting on:</span>
    <span class="alliance-reference-meta-waiting">${waitingOn}</span>
  </div>`;

export const allianceRequestsHtml = (
  requests: AllianceRequest[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  kind: "incoming" | "outgoing" = "incoming",
  nowMs = Date.now()
): string => {
  if (requests.length === 0) return "";
  return [...requests]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(
      (request) => {
        const playerId = kind === "incoming" ? request.fromPlayerId : request.toPlayerId;
        const playerName =
          kind === "incoming"
            ? request.fromName ?? playerNameForOwner(request.fromPlayerId) ?? request.fromPlayerId.slice(0, 8)
            : request.toName ?? playerNameForOwner(request.toPlayerId) ?? request.toPlayerId.slice(0, 8);
        const ageLabel = socialRelativeAgeLabel(request.createdAt, nowMs);
        const sentBy = kind === "incoming" ? playerName : "You";
        const waitingOn = kind === "incoming" ? "You" : playerName;
        return `<article class="card alliance-reference-card alliance-reference-card-pending">
      <div class="alliance-reference-top">
        <div class="alliance-reference-copy">
          <button class="player-link alliance-reference-name" type="button" data-inspect-player="${playerId}">${playerName}</button>
          <div class="alliance-reference-id">${socialPlayerIdLabel(playerId)}</div>
        </div>
        <div class="alliance-reference-right">
          <div class="alliance-reference-time">${ageLabel}</div>
        </div>
      </div>
      ${socialMetaLineHtml(sentBy, waitingOn)}
      ${
        kind === "incoming"
          ? `<div class="alliance-reference-actions">
        <button class="panel-btn alliance-reference-action alliance-reference-action-accept accept-request" type="button" data-request-id="${request.id}">Accept</button>
        <button class="panel-btn alliance-reference-action alliance-reference-action-reject reject-request" type="button" data-request-id="${request.id}">Reject</button>
      </div>`
          : `<button class="panel-btn alliance-reference-action alliance-reference-action-cancel cancel-request" type="button" data-request-id="${request.id}">Cancel Request</button>`
      }
    </article>`;
      }
    )
    .join("");
};

export const alliesHtml = (
  allies: string[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  activeAllianceBreaks: ActiveAllianceBreakView[] = [],
  nowMs = Date.now()
): string => {
  if (allies.length === 0) return `<article class="card alliance-empty-card"><p>No allies.</p></article>`;
  const activeBreakByPlayerId = new Map(activeAllianceBreaks.map((notice) => [notice.otherPlayerId, notice]));
  return allies
    .map((id) => {
      const notice = activeBreakByPlayerId.get(id);
      const name = playerNameForOwner(id) ?? notice?.otherPlayerName ?? id.slice(0, 8);
      const remainingLabel = notice ? socialRemainingLabel(notice.endsAt, nowMs) : "";
      const finalizingBreak = notice ? notice.endsAt <= nowMs : false;
      return `<article class="card alliance-reference-card${notice ? " alliance-reference-card-breaking" : ""}">
      <div class="alliance-reference-top">
        <div class="alliance-reference-copy">
          <button class="player-link alliance-reference-name" type="button" data-inspect-player="${id}">${name}</button>
          <div class="alliance-reference-id">${socialPlayerIdLabel(id)}</div>
        </div>
        <div class="alliance-reference-right">
          ${
            notice
              ? `<div class="alliance-reference-status alliance-reference-status-breaking">${socialBreakIcon()}<span>${finalizingBreak ? "Finalizing" : "Breaking"}</span></div>
          <div class="alliance-reference-duration-note">${finalizingBreak ? "sync pending" : `${remainingLabel} notice`}</div>`
              : `<div class="alliance-reference-status alliance-reference-status-active">${socialCheckIcon()}<span>Active</span></div>`
          }
        </div>
      </div>
      ${
        notice
          ? `<div class="alliance-reference-meta">
        <span class="alliance-reference-meta-label">${finalizingBreak ? "Notice elapsed; final break is syncing." : "Alliance remains active until notice ends."}</span>
      </div>`
          : `<button class="panel-btn alliance-reference-action alliance-reference-action-break break-alliance" type="button" data-alliance-break-player-id="${id}">Break Alliance</button>`
      }
    </article>`;
    })
    .join("");
};

export const truceRequestsHtml = (
  requests: TruceRequest[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  kind: "incoming" | "outgoing" = "incoming",
  nowMs = Date.now()
): string => {
  if (requests.length === 0) return "";
  return [...requests]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(
      (request) => {
        const playerId = kind === "incoming" ? request.fromPlayerId : request.toPlayerId;
        const playerName =
          kind === "incoming"
            ? request.fromName ?? playerNameForOwner(request.fromPlayerId) ?? request.fromPlayerId.slice(0, 8)
            : request.toName ?? playerNameForOwner(request.toPlayerId) ?? request.toPlayerId.slice(0, 8);
        const ageLabel = socialRelativeAgeLabel(request.createdAt, nowMs);
        const sentBy = kind === "incoming" ? playerName : "You";
        const waitingOn = kind === "incoming" ? "You" : playerName;
        return `<article class="card alliance-reference-card alliance-reference-card-pending" data-request-age="${ageLabel}">
      <div class="alliance-reference-top">
        <div class="alliance-reference-copy">
          <button class="player-link alliance-reference-name" type="button" data-inspect-player="${playerId}">${playerName}</button>
          <div class="alliance-reference-id">${socialPlayerIdLabel(playerId)}</div>
        </div>
        <div class="alliance-reference-right">
          <div class="alliance-reference-duration">${socialClockIcon()}<span>${request.durationHours}h</span></div>
          <div class="alliance-reference-duration-note">duration</div>
        </div>
      </div>
      ${socialMetaLineHtml(sentBy, waitingOn)}
      ${
        kind === "incoming"
          ? `<div class="alliance-reference-actions">
        <button class="panel-btn alliance-reference-action alliance-reference-action-accept accept-truce" type="button" data-truce-request-id="${request.id}">Accept</button>
        <button class="panel-btn alliance-reference-action alliance-reference-action-reject reject-truce" type="button" data-truce-request-id="${request.id}">Reject</button>
      </div>`
          : `<button class="panel-btn alliance-reference-action alliance-reference-action-cancel cancel-truce" type="button" data-truce-request-id="${request.id}">Cancel Request</button>`
      }
    </article>`;
      }
    )
    .join("");
};

export const activeTrucesHtml = (
  truces: ActiveTruceView[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  nowMs = Date.now()
): string => {
  if (truces.length === 0) return `<article class="card alliance-empty-card"><p>No active truces.</p></article>`;
  return truces
    .map((truce) => {
      const remainingLabel = socialRemainingLabel(truce.endsAt, nowMs);
      return `<article class="card alliance-reference-card">
      <div class="alliance-reference-top">
        <div class="alliance-reference-copy">
          <button class="player-link alliance-reference-name" type="button" data-inspect-player="${truce.otherPlayerId}">${
            truce.otherPlayerName ?? playerNameForOwner(truce.otherPlayerId) ?? truce.otherPlayerId.slice(0, 8)
          }</button>
          <div class="alliance-reference-id">${socialPlayerIdLabel(truce.otherPlayerId)}</div>
        </div>
        <div class="alliance-reference-right">
          <div class="alliance-reference-duration">${socialClockIcon()}<span>${remainingLabel}</span></div>
          <div class="alliance-reference-duration-note">remaining</div>
        </div>
      </div>
    </article>`;
    })
    .join("");
};

export const strategicRibbonHtml = (
  strategicResources: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>,
  strategicProductionPerMinute: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>,
  upkeepPerMinute: { food: number; iron: number; supply: number; crystal: number; gold: number },
  strategicAnim: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", { until: number; dir: -1 | 0 | 1 }>,
  rateToneClass: (rate: number) => string
): string => {
  const nowMs = Date.now();
  const entries: Array<{
    key: "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY";
    icon: string;
    label: string;
    source: string;
    className: string;
  }> = [
    { key: "FOOD", icon: "🍞", label: "Food", source: "From Farms + Fish", className: "res-food" },
    { key: "IRON", icon: "⛏", label: "Iron", source: "From Iron nodes", className: "res-iron" },
    { key: "CRYSTAL", icon: "💎", label: "Crystal", source: "From Gem nodes", className: "res-crystal" },
    { key: "SUPPLY", icon: "🦊", label: "Supply", source: "From Fur + Wood", className: "res-stone" }
  ];
  return `<div class="resource-ribbon">${entries
    .map((entry) => {
      const stock = strategicResources[entry.key];
      const upkeep =
        entry.key === "FOOD"
          ? upkeepPerMinute.food
          : entry.key === "IRON"
            ? upkeepPerMinute.iron
            : entry.key === "CRYSTAL"
              ? upkeepPerMinute.crystal
              : entry.key === "SUPPLY"
                ? upkeepPerMinute.supply
                : 0;
      const net = strategicProductionPerMinute[entry.key] - upkeep;
      const prodText = `${net > 0 ? "+" : ""}${net.toFixed(2)}/m`;
      const rateClass = rateToneClass(net);
      const anim = strategicAnim[entry.key];
      const deltaClass =
        nowMs < anim.until ? (anim.dir > 0 ? "delta-up" : anim.dir < 0 ? "delta-down" : "") : "";
      return `<button class="resource-pill ${entry.className} ${deltaClass}" type="button" data-economy-open="${entry.key}" title="${entry.label} · ${entry.source}">
        <span class="resource-icon" aria-hidden="true">${entry.icon}</span>
        <span class="resource-value-row">
          <span class="resource-value">${Number(stock).toFixed(1)}</span>
          ${prodText ? `<span class="resource-rate ${rateClass}">${prodText}</span>` : ""}
        </span>
      </button>`;
    })
    .join("")}</div>`;
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
        <div class="mission-reward">${mission.rewardLabel ?? `Reward +${mission.rewardPoints} Gold`}</div>
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
  playerColors: ReadonlyMap<string, string> = new Map()
): string => {
  const overallLineText = (entry: LeaderboardOverallEntry): string =>
    `${entry.name} | score ${entry.score.toFixed(1)} | settled ${entry.tiles} | income ${entry.incomePerMinute.toFixed(1)} | tech ${entry.techs}`;
  const overallLineHtml = (entry: LeaderboardOverallEntry): string =>
    `${playerNameBadgeHtml(entry.id, entry.name, playerColors)} | score ${entry.score.toFixed(1)} | settled ${entry.tiles} | income ${entry.incomePerMinute.toFixed(1)} | tech ${entry.techs}`;
  const metricLineText = (entry: LeaderboardMetricEntry): string => `${entry.name} (${entry.value.toFixed(1)})`;
  const metricLineHtml = (entry: LeaderboardMetricEntry): string => `${playerNameBadgeHtml(entry.id, entry.name, playerColors)} (${entry.value.toFixed(1)})`;
  const includesOverallEntry = (entries: LeaderboardOverallEntry[], selfEntry: LeaderboardOverallEntry | undefined): boolean => {
    if (!selfEntry) return false;
    return entries.some((entry) => entry.id === selfEntry.id || (entry.rank === selfEntry.rank && overallLineText(entry) === overallLineText(selfEntry)));
  };
  const includesMetricEntry = (entries: LeaderboardMetricEntry[], selfEntry: LeaderboardMetricEntry | undefined): boolean => {
    if (!selfEntry) return false;
    return entries.some((entry) => entry.id === selfEntry.id || (entry.rank === selfEntry.rank && metricLineText(entry) === metricLineText(selfEntry)));
  };
  const selfPlayerId =
    leaderboard.selfOverall?.id ?? leaderboard.selfByTiles?.id ?? leaderboard.selfByIncome?.id ?? leaderboard.selfByTechs?.id;
  const isSelfPlayer = (playerId: string | undefined): boolean => Boolean(playerId && selfPlayerId && playerId === selfPlayerId);
  const shouldShowSelfProgress = (objective: SeasonVictoryObjectiveView): boolean =>
    Boolean(objective.selfProgressLabel) && !isSelfPlayer(objective.leaderPlayerId);
  const objectiveLeaderHtml = (objective: SeasonVictoryObjectiveView): string =>
    objective.leaderPlayerId ? playerNameBadgeHtml(objective.leaderPlayerId, isSelfPlayer(objective.leaderPlayerId) ? "You" : objective.leaderName, playerColors) : escapeHtml(objective.leaderName);
  const metricRows = (entries: LeaderboardMetricEntry[], selfEntry: LeaderboardMetricEntry | undefined): string =>
    `${entries.map((entry) => `<div class="lb-row">${entry.rank}. ${metricLineHtml(entry)}</div>`).join("")}${
      selfEntry && selfEntry.rank !== 1 && !includesMetricEntry(entries, selfEntry)
        ? `<div class="lb-row">${selfEntry.rank}. ${playerNameBadgeHtml(selfEntry.id, "You", playerColors)} (${selfEntry.value.toFixed(1)})</div>`
        : ""
    }`;
  const winnerCard = seasonWinner
    ? `
    <article class="card pressure-card">
      <strong>Season Winner</strong>
      <div class="pressure-row">
        <div class="pressure-head">
          <span class="pressure-name">${playerNameBadgeHtml(seasonWinner.playerId, isSelfPlayer(seasonWinner.playerId) ? "You" : seasonWinner.playerName, playerColors)}</span>
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
      <strong>Season Victory</strong>
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
          ? `<div class="lb-row">${leaderboard.selfOverall.rank}. ${playerNameBadgeHtml(leaderboard.selfOverall.id, "You", playerColors)} | score ${leaderboard.selfOverall.score.toFixed(1)} | settled ${leaderboard.selfOverall.tiles} | income ${leaderboard.selfOverall.incomePerMinute.toFixed(1)} | tech ${leaderboard.selfOverall.techs}</div>`
          : ""
      }
    </article>
    <article class="card">
      <strong>Most Settled Tiles</strong>
      ${metricRows(leaderboard.byTiles, leaderboard.selfByTiles)}
    </article>
    <article class="card">
      <strong>Most Income</strong>
      ${metricRows(leaderboard.byIncome, leaderboard.selfByIncome)}
    </article>
    <article class="card">
      <strong>Most Techs</strong>
      ${metricRows(leaderboard.byTechs, leaderboard.selfByTechs)}
    </article>
  `;
};

export const developmentSlotPipsHtml = (summary: { busy: number; limit: number }): string =>
  Array.from({ length: summary.limit }, (_, index) => `<span class="dev-slot-pip${index < summary.busy ? " is-busy" : ""}"></span>`).join("");
