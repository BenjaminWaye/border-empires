import type {
  ActiveTruceView,
  AllianceRequest,
  FeedEntry,
  FeedType,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  MissionState,
  SeasonVictoryObjectiveView,
  SeasonWinnerView,
  TruceRequest
} from "./client-types.js";

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

export const allianceRequestsHtml = (
  requests: AllianceRequest[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  kind: "incoming" | "outgoing" = "incoming",
  nowMs = Date.now()
): string => {
  if (requests.length === 0) return `<article class="card alliance-empty-card"><p>No ${kind} requests.</p></article>`;
  return requests
    .map(
      (request) => {
        const playerId = kind === "incoming" ? request.fromPlayerId : request.toPlayerId;
        const playerName =
          kind === "incoming"
            ? request.fromName ?? playerNameForOwner(request.fromPlayerId) ?? request.fromPlayerId.slice(0, 8)
            : request.toName ?? playerNameForOwner(request.toPlayerId) ?? request.toPlayerId.slice(0, 8);
        const ageLabel = socialRelativeAgeLabel(request.createdAt, nowMs);
        return `<article class="card alliance-status-card alliance-status-card-pending">
      <div class="alliance-status-card-top">
        <div class="alliance-status-card-copy">
          <button class="player-link alliance-player-name" type="button" data-inspect-player="${playerId}">${playerName}</button>
          <p class="alliance-player-id">${socialPlayerIdLabel(playerId)}</p>
        </div>
        <div class="alliance-status-side">
          <span class="alliance-time-label">${ageLabel}</span>
        </div>
      </div>
      ${
        kind === "incoming"
          ? `<div class="alliance-action-row">
        <button class="panel-btn alliance-decision-btn alliance-accept-btn accept-request" type="button" data-request-id="${request.id}">Accept</button>
        <button class="panel-btn alliance-decision-btn alliance-reject-btn reject-request" type="button" data-request-id="${request.id}">Reject</button>
      </div>`
          : `<div class="alliance-card-footnote">Awaiting response.</div>`
      }
    </article>`;
      }
    )
    .join("");
};

export const alliesHtml = (allies: string[], playerNameForOwner: (ownerId?: string | null) => string | undefined): string => {
  if (allies.length === 0) return `<article class="card alliance-empty-card"><p>No allies.</p></article>`;
  return allies
    .map(
      (id) => `<article class="card alliance-status-card">
      <div class="alliance-status-card-top">
        <div class="alliance-status-card-copy">
          <button class="player-link alliance-player-name" type="button" data-inspect-player="${id}">${playerNameForOwner(id) ?? id.slice(0, 8)}</button>
          <p class="alliance-player-id">${socialPlayerIdLabel(id)}</p>
        </div>
        <div class="alliance-status-side">
          <span class="alliance-status-chip alliance-status-chip-emerald">Active</span>
        </div>
      </div>
    </article>`
    )
    .join("");
};

export const truceRequestsHtml = (
  requests: TruceRequest[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  nowMs = Date.now()
): string => {
  if (requests.length === 0) return `<article class="card alliance-empty-card"><p>No incoming truces.</p></article>`;
  return requests
    .map(
      (request) => `<article class="card alliance-status-card alliance-status-card-pending">
      <div class="alliance-status-card-top">
        <div class="alliance-status-card-copy">
          <button class="player-link alliance-player-name" type="button" data-inspect-player="${request.fromPlayerId}">${
            request.fromName ?? playerNameForOwner(request.fromPlayerId) ?? request.fromPlayerId.slice(0, 8)
          }</button>
          <p class="alliance-player-id">${socialPlayerIdLabel(request.fromPlayerId)}</p>
        </div>
        <div class="alliance-status-side">
          <span class="alliance-time-pill alliance-time-pill-cyan">${request.durationHours}h</span>
          <span class="alliance-time-note">${socialRelativeAgeLabel(request.createdAt, nowMs)}</span>
        </div>
      </div>
      <div class="alliance-action-row">
        <button class="panel-btn alliance-decision-btn alliance-accept-btn accept-truce" type="button" data-truce-request-id="${request.id}">Accept</button>
        <button class="panel-btn alliance-decision-btn alliance-reject-btn reject-truce" type="button" data-truce-request-id="${request.id}">Reject</button>
      </div>
    </article>`
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
      return `<article class="card alliance-status-card">
      <div class="alliance-status-card-top">
        <div class="alliance-status-card-copy">
          <button class="player-link alliance-player-name" type="button" data-inspect-player="${truce.otherPlayerId}">${
            truce.otherPlayerName ?? playerNameForOwner(truce.otherPlayerId) ?? truce.otherPlayerId.slice(0, 8)
          }</button>
          <p class="alliance-player-id">${socialPlayerIdLabel(truce.otherPlayerId)}</p>
        </div>
        <div class="alliance-status-side">
          <span class="alliance-time-pill alliance-time-pill-cyan">${remainingLabel}</span>
          <span class="alliance-time-note">remaining</span>
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
  seasonWinner: SeasonWinnerView | null | undefined
): string => {
  const overallLine = (entry: LeaderboardOverallEntry): string =>
    `${entry.name} | score ${entry.score.toFixed(1)} | settled ${entry.tiles} | income ${entry.incomePerMinute.toFixed(1)} | tech ${entry.techs}`;
  const metricLine = (entry: LeaderboardMetricEntry): string => `${entry.name} (${entry.value.toFixed(1)})`;
  const shouldShowSelfProgress = (objective: SeasonVictoryObjectiveView): boolean =>
    Boolean(objective.selfProgressLabel) && objective.leaderPlayerId !== "me";
  const metricRows = (entries: LeaderboardMetricEntry[], selfEntry: LeaderboardMetricEntry | undefined): string =>
    `${entries.map((entry) => `<div class="lb-row">${entry.rank}. ${metricLine(entry)}</div>`).join("")}${
      selfEntry && selfEntry.rank !== 1 ? `<div class="lb-row">${selfEntry.rank}. You (${selfEntry.value.toFixed(1)})</div>` : ""
    }`;
  const winnerCard = seasonWinner
    ? `
    <article class="card pressure-card">
      <strong>Season Winner</strong>
      <div class="pressure-row">
        <div class="pressure-head">
          <span class="pressure-name">${seasonWinner.playerName}</span>
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
            <div class="pressure-meta">Leader: ${objective.leaderName} · ${objective.progressLabel}</div>
            ${shouldShowSelfProgress(objective) ? `<div class="pressure-meta">You: ${objective.selfProgressLabel}</div>` : ""}
            <div class="pressure-meta">${objective.thresholdLabel}</div>
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
      ${leaderboard.overall.map((entry) => `<div class="lb-row">${entry.rank}. ${overallLine(entry)}</div>`).join("")}
      ${leaderboard.selfOverall && leaderboard.selfOverall.rank !== 1 ? `<div class="lb-row">${leaderboard.selfOverall.rank}. You | score ${leaderboard.selfOverall.score.toFixed(1)} | settled ${leaderboard.selfOverall.tiles} | income ${leaderboard.selfOverall.incomePerMinute.toFixed(1)} | tech ${leaderboard.selfOverall.techs}</div>` : ""}
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
