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

export const feedHtml = (feed: FeedEntry[]): string => {
  if (feed.length === 0) return `<article class="card"><p>No activity yet.</p></article>`;
  return feed
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
    .join("");
};

export const allianceRequestsHtml = (
  requests: AllianceRequest[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined,
  kind: "incoming" | "outgoing" = "incoming"
): string => {
  if (requests.length === 0) return `<article class="card"><p>No ${kind} requests.</p></article>`;
  return requests
    .map(
      (request) => `<article class="card alliance-row">
      <div>
        <button class="player-link" type="button" data-inspect-player="${kind === "incoming" ? request.fromPlayerId : request.toPlayerId}">${
          kind === "incoming"
            ? request.fromName ?? playerNameForOwner(request.fromPlayerId) ?? request.fromPlayerId.slice(0, 8)
            : request.toName ?? playerNameForOwner(request.toPlayerId) ?? request.toPlayerId.slice(0, 8)
        }</button>
        <p>${kind === "incoming" ? "Incoming" : "Outgoing"} · Request ${request.id.slice(0, 8)}</p>
      </div>
      ${
        kind === "incoming"
          ? `<button class="panel-btn accept-request" data-request-id="${request.id}">Accept</button>`
          : `<button class="panel-btn" disabled>Pending</button>`
      }
    </article>`
    )
    .join("");
};

export const alliesHtml = (allies: string[], playerNameForOwner: (ownerId?: string | null) => string | undefined): string => {
  if (allies.length === 0) return `<article class="card"><p>No allies.</p></article>`;
  return allies
    .map(
      (id) => `<article class="card alliance-row">
      <div><button class="player-link" type="button" data-inspect-player="${id}">${playerNameForOwner(id) ?? id.slice(0, 8)}</button><p>Allied</p></div>
      <button class="panel-btn break-ally" data-ally-id="${id}">Break</button>
    </article>`
    )
    .join("");
};

export const truceRequestsHtml = (
  requests: TruceRequest[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined
): string => {
  if (requests.length === 0) return `<article class="card"><p>No incoming truces.</p></article>`;
  return requests
    .map(
      (request) => `<article class="card alliance-row">
      <div>
        <strong>${request.fromName ?? playerNameForOwner(request.fromPlayerId) ?? request.fromPlayerId.slice(0, 8)}</strong>
        <p>${request.durationHours}h truce</p>
      </div>
      <button class="panel-btn accept-truce" data-truce-request-id="${request.id}">Accept</button>
    </article>`
    )
    .join("");
};

export const activeTrucesHtml = (
  truces: ActiveTruceView[],
  playerNameForOwner: (ownerId?: string | null) => string | undefined
): string => {
  if (truces.length === 0) return `<article class="card"><p>No active truces.</p></article>`;
  return truces
    .map((truce) => {
      const remainingMs = Math.max(0, truce.endsAt - Date.now());
      const remainingHours = remainingMs >= 3_600_000 ? `${Math.ceil(remainingMs / 3_600_000)}h left` : `${Math.ceil(remainingMs / 60_000)}m left`;
      return `<article class="card alliance-row">
      <div>
        <strong>${truce.otherPlayerName ?? playerNameForOwner(truce.otherPlayerId) ?? truce.otherPlayerId.slice(0, 8)}</strong>
        <p>Truce · ${remainingHours}</p>
      </div>
      <button class="panel-btn break-truce" data-truce-player-id="${truce.otherPlayerId}">Break</button>
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
  const metricRows = (entries: LeaderboardMetricEntry[], selfEntry: LeaderboardMetricEntry | undefined): string =>
    `${entries.map((entry) => `<div class="lb-row">${entry.rank}. ${metricLine(entry)}</div>`).join("")}${
      selfEntry ? `<div class="lb-row">${selfEntry.rank}. You (${selfEntry.value.toFixed(1)})</div>` : ""
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
            ${objective.selfProgressLabel ? `<div class="pressure-meta">You: ${objective.selfProgressLabel}</div>` : ""}
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
      ${leaderboard.selfOverall ? `<div class="lb-row">${leaderboard.selfOverall.rank}. You | score ${leaderboard.selfOverall.score.toFixed(1)} | settled ${leaderboard.selfOverall.tiles} | income ${leaderboard.selfOverall.incomePerMinute.toFixed(1)} | tech ${leaderboard.selfOverall.techs}</div>` : ""}
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
