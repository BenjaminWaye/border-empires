import { EXPAND_MANPOWER_COST, FRONTIER_CLAIM_COST } from "@border-empires/shared";
import { prettyToken } from "../client-app-runtime-utils.js";
import { formatGoldAmount } from "../client-constants.js";
import { resourceIconForKey } from "../client-map-display.js";
import { maybeRegisterShardRainPing } from "../client-shard-rain-pings/client-shard-rain-pings.js";
import { victoryHoldAlertFor } from "../client-victory-alert/client-victory-alert.js";
import type { ClientState } from "../client-state/client-state.js";
import type { ClientShardRainAlert } from "../client-shard-alert/client-shard-alert.js";
import type { DiscoveryTipDef } from "../client-discovery-tips/client-discovery-tips.js";
import type { FeedEntry, FeedSeverity, FeedType, SeasonVictoryObjectiveView, Tile } from "../client-types.js";

type FeedMutableState = Pick<ClientState, "feed"> &
  Partial<Pick<ClientState, "activePanel" | "mobilePanel" | "feedUnreadCount" | "feedAttentionUntil">>;

const shouldPulseFeedButton = (entry: FeedEntry): boolean =>
  entry.severity === "warn" ||
  entry.severity === "error" ||
  entry.type === "alliance" ||
  (entry.type === "combat" && entry.severity === "success") ||
  (entry.type === "tech" && entry.severity === "success");

const mobileFeedPanelVisible = (state: FeedMutableState): boolean =>
  state.mobilePanel === "feed" &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 900px)").matches;

const markFeedUnread = (state: FeedMutableState, entry: FeedEntry): void => {
  const feedOpen = state.activePanel === "feed" || mobileFeedPanelVisible(state);
  if (feedOpen) return;
  state.feedUnreadCount = (state.feedUnreadCount ?? 0) + 1;
  if (shouldPulseFeedButton(entry)) state.feedAttentionUntil = Date.now() + 2_800;
};

export const pushFeed = (state: FeedMutableState, msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void => {
  const entry = { text: msg, type, severity, at: Date.now() };
  state.feed.unshift(entry);
  state.feed = state.feed.slice(0, 18);
  markFeedUnread(state, entry);
};

export const pushFeedEntry = (state: FeedMutableState, entry: FeedEntry): void => {
  state.feed.unshift(entry);
  state.feed = state.feed.slice(0, 18);
  markFeedUnread(state, entry);
};

/** `onShow` handler shared by every `announceDiscoveryTip`/`renderDiscoveryTipOverlay`
 * call site: records a freshly-shown discovery tip into the Activity Feed so the
 * player can scroll back and re-read it after the toast is gone. */
export const pushDiscoveryTipFeedEntry = (state: FeedMutableState, def: DiscoveryTipDef): void => {
  pushFeedEntry(state, { title: def.title, text: def.body, type: "info", severity: "info", at: Date.now() });
};

export const maybeAnnounceShardSite = (
  state: Pick<ClientState, "shardRainPingsByTile" | "shardAlert">,
  previous: Tile | undefined,
  next: Tile
): void => {
  maybeRegisterShardRainPing(state, previous, next);
};

export const shardAlertKeyForPayload = (phase: "upcoming" | "started", startsAt: number): string => `${phase}:${startsAt}`;

export const showShardAlert = (
  state: Pick<ClientState, "dismissedShardAlertKeys" | "shardAlert" | "shardRainStatus">,
  alert: ClientShardRainAlert
): void => {
  // shardRainStatus drives the persistent domain-panel countdown and is never
  // cleared by dismissing the one-time toast alert below, so it must be kept
  // in sync regardless of the dismissed-key check.
  state.shardRainStatus = alert;
  if (state.dismissedShardAlertKeys.has(alert.key)) return;
  state.shardAlert = alert;
};

export const hideShardAlert = (
  state: Pick<ClientState, "dismissedShardAlertKeys" | "shardAlert" | "shardRainFxUntil">
): void => {
  if (state.shardAlert) state.dismissedShardAlertKeys.add(state.shardAlert.key);
  state.shardAlert = undefined;
  state.shardRainFxUntil = 0;
};

// Recomputes the season-victory hold alert whenever seasonVictory data
// arrives from the server (see client-network.ts call sites). Re-collapses
// automatically for objectives/leaders already acknowledged this session,
// but never fully clears the alert while a hold is active — this is meant to
// stay acutely visible, unlike the dismiss-and-forget shardAlert toast.
export const updateVictoryHoldAlert = (
  state: Pick<ClientState, "victoryHoldAlert" | "victoryHoldAlertCollapsed" | "acknowledgedVictoryHoldAlertKeys">,
  seasonVictory: SeasonVictoryObjectiveView[],
  selfPlayerId: string | undefined
): void => {
  const next = victoryHoldAlertFor(seasonVictory, selfPlayerId);
  if (!next) {
    state.victoryHoldAlert = undefined;
    state.victoryHoldAlertCollapsed = false;
    return;
  }
  state.victoryHoldAlert = next;
  state.victoryHoldAlertCollapsed = state.acknowledgedVictoryHoldAlertKeys.has(next.key);
};

export const acknowledgeVictoryHoldAlert = (
  state: Pick<ClientState, "victoryHoldAlert" | "victoryHoldAlertCollapsed" | "acknowledgedVictoryHoldAlertKeys">
): void => {
  if (state.victoryHoldAlert) state.acknowledgedVictoryHoldAlertKeys.add(state.victoryHoldAlert.key);
  state.victoryHoldAlertCollapsed = true;
};

// Applies a leaderboard/season-victory payload and refreshes the hold alert
// in one call — used by every client-network.ts handler that receives
// seasonVictory + seasonWinner together, so those call sites don't need a
// separate updateVictoryHoldAlert line each.
export const applySeasonVictorySnapshot = (
  state: Pick<ClientState, "seasonVictory" | "seasonWinner" | "seasonStats" | "victoryHoldAlert" | "victoryHoldAlertCollapsed" | "acknowledgedVictoryHoldAlertKeys">,
  seasonVictory: SeasonVictoryObjectiveView[] | undefined,
  seasonWinner: ClientState["seasonWinner"] | undefined,
  selfPlayerId: string | undefined
): void => {
  if (seasonVictory) state.seasonVictory = seasonVictory;
  if (seasonWinner) {
    state.seasonWinner = seasonWinner;
    // The winner snapshot carries misc season stats (deadliest tile, longest
    // road) so they survive a reconnect/fresh-login INIT, which never sends
    // a separate GLOBAL_STATUS_UPDATE.
    if (seasonWinner.seasonStats) state.seasonStats = seasonWinner.seasonStats;
  }
  updateVictoryHoldAlert(state, state.seasonVictory, selfPlayerId);
};

// The season is decided (or about to roll over) — the hold-timer alert no longer applies.
export const clearVictoryHoldAlert = (state: Pick<ClientState, "victoryHoldAlert" | "victoryHoldAlertCollapsed">): void => {
  state.victoryHoldAlert = undefined;
  state.victoryHoldAlertCollapsed = false;
};

export const resetVictoryHoldAlertForNewSeason = (
  state: Pick<ClientState, "victoryHoldAlert" | "victoryHoldAlertCollapsed" | "acknowledgedVictoryHoldAlertKeys">
): void => {
  clearVictoryHoldAlert(state);
  state.acknowledgedVictoryHoldAlertKeys.clear();
};

export const showCaptureAlert = (
  state: Pick<ClientState, "captureAlert">,
  title: string,
  detail: string,
  tone: "success" | "error" | "warn" = "error",
  manpowerLoss?: number
): void => {
  state.captureAlert = {
    title,
    detail,
    until: Date.now() + 12_000,
    tone,
    ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
  };
};

export const notifyInsufficientGoldForFrontierAction = (
  state: Pick<ClientState, "gold" | "captureAlert"> & FeedMutableState,
  action: "claim" | "attack"
): void => {
  const label = action === "claim" ? "Frontier claim" : "Attack";
  const detail = `${label} costs ${formatGoldAmount(FRONTIER_CLAIM_COST)} gold. You have ${formatGoldAmount(state.gold)}.`;
  showCaptureAlert(state, "Insufficient gold", detail, "error");
};

// Mirrors notifyInsufficientGoldForFrontierAction, but for manpower, and
// only for the EXPAND claim (attack manpower cost varies per target's
// muster, unlike EXPAND_MANPOWER_COST, so this doesn't try to cover it).
// Clicking a neutral tile directly (queueAdjacentExpandClaim,
// client-action-flow.ts) checked gold up front and surfaced this same
// prominent showCaptureAlert on failure, but had no matching upfront
// manpower check -- a 0-manpower click instead fell all the way through to
// the durable waypoint queue, which only ever surfaces a quiet feed-panel
// line ("Waypoint paused...", client-waypoint-manpower-pause.ts) once the
// queue actually gets drained. Easy to miss, and looked like the click did
// nothing. This gives manpower the same immediate, visible rejection gold
// already had.
export const notifyInsufficientManpowerForFrontierClaim = (
  state: Pick<ClientState, "manpower" | "captureAlert"> & FeedMutableState
): void => {
  const detail = `Frontier claim costs ${EXPAND_MANPOWER_COST} manpower. You have ${Math.floor(state.manpower)}.`;
  showCaptureAlert(state, "Insufficient manpower", detail, "error");
};

const playerNameOrFallback = (
  ownerId: string | undefined,
  deps: { playerNameForOwner: (ownerId?: string | null) => string | undefined }
): string => {
  if (!ownerId) return "neutral territory";
  if (ownerId === "barbarian") return "Barbarians";
  return deps.playerNameForOwner(ownerId) ?? ownerId.slice(0, 8);
};

const territoryLabelForOwner = (
  ownerId: string | undefined,
  deps: { playerNameForOwner: (ownerId?: string | null) => string | undefined }
): string => {
  if (!ownerId) return "neutral territory";
  if (ownerId === "barbarian") return "barbarian territory";
  return playerNameOrFallback(ownerId, deps);
};

const conqueredTileLabel = (
  tile: Tile | undefined,
  target: { x: number; y: number } | undefined,
  deps: {
    prettyToken: (value: string) => string;
    resourceLabel: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    terrainAt: (x: number, y: number) => Tile["terrain"];
  }
): string => {
  if (tile?.town?.name) return tile.town.name;
  if (tile?.town) return "Town";
  if (tile?.dockId) return "Dock";
  if (tile?.resource) return deps.prettyToken(deps.resourceLabel(tile.resource));
  if (target) return deps.prettyToken(deps.terrainLabel(target.x, target.y, tile?.terrain ?? deps.terrainAt(target.x, target.y)));
  return "Territory";
};

const settledTileLabel = (
  target: { x: number; y: number } | undefined,
  deps: {
    tiles: Map<string, Tile>;
    keyFor: (x: number, y: number) => string;
    prettyToken: (value: string) => string;
    resourceLabel: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    terrainAt: (x: number, y: number) => Tile["terrain"];
  }
): string => {
  if (!target) return "Land";
  const tile = deps.tiles.get(deps.keyFor(target.x, target.y));
  if (tile?.town?.name) return tile.town.name;
  if (tile?.town) return "Town";
  if (tile?.dockId) return "Dock";
  if (tile?.resource) return deps.prettyToken(deps.resourceLabel(tile.resource));
  return deps.prettyToken(deps.terrainLabel(target.x, target.y, tile?.terrain ?? deps.terrainAt(target.x, target.y)));
};

const formatPlunderAmount = (amount: number): string => {
  const rounded = Math.round(amount);
  return Math.abs(amount - rounded) < 0.01 ? String(rounded) : amount.toFixed(2);
};

const pillagedResourceParts = (
  msg: Record<string, unknown>,
  deps: { prettyToken: (value: string) => string }
): string[] => {
  const pillagedGold = typeof msg.pillagedGold === "number" ? msg.pillagedGold : 0;
  const strategic = (msg.pillagedStrategic as Record<string, number> | undefined) ?? {};
  const parts: string[] = [];
  if (pillagedGold > 0.01) parts.push(`${resourceIconForKey("GOLD")} ${formatGoldAmount(pillagedGold)}`);
  for (const resource of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = strategic[resource];
    if (typeof amount !== "number" || amount <= 0.01) continue;
    parts.push(`${resourceIconForKey(resource)} ${formatPlunderAmount(amount)} ${deps.prettyToken(resource)}`);
  }
  return parts;
};

const plunderSummary = (
  msg: Record<string, unknown>,
  deps: { prettyToken: (value: string) => string }
): string | undefined => {
  const parts = pillagedResourceParts(msg, deps);
  if (parts.length === 0) return undefined;
  return ` Plundered ${parts.join(", ")}.`;
};

// Mirror of plunderSummary/combatResolutionAlert, but for the RAID_RESULT
// message a defender receives when their tile is captured — same pillaged
// gold/strategic fields, framed as a loss from their side rather than a gain
// from the attacker's. There is no defender manpower loss on a capture (only
// gold/resources — see runtime-lock-resolution.ts's applySettledCapturePlunder/
// applyResourceTileSteal), so this never mentions manpower.
export const raidResultFeedEntry = (
  msg: Record<string, unknown>,
  deps: { playerNameForOwner: (ownerId?: string | null) => string | undefined }
): FeedEntry => {
  const target = msg.target as { x: number; y: number } | undefined;
  const attackerId = typeof msg.attackerId === "string" ? msg.attackerId : undefined;
  const attackerName = playerNameOrFallback(attackerId, deps);
  const parts = pillagedResourceParts(msg, { prettyToken });
  const lossDetail = parts.length > 0 ? ` Lost ${parts.join(", ")}.` : "";
  return {
    text: `Raided by ${attackerName}${target ? ` at (${target.x}, ${target.y})` : ""}.${lossDetail}`,
    type: "combat",
    severity: "error",
    at: Date.now(),
    ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Go to tile" } : {})
  };
};

// AETHER_PURGE_ALERT is a direct-target hit (unlike a conventional attack,
// it's instant -- no incoming-attack countdown to track), so this is
// deliberately more drastic than raidResultFeedEntry's plunder-loss framing:
// the victim lost the tile outright.
export const aetherPurgeAlertFeedEntry = (msg: Record<string, unknown>): FeedEntry => {
  const attackerName = (msg.attackerName as string | undefined) || (msg.attackerId as string | undefined) || "An enemy empire";
  const x = Number(msg.x ?? -1);
  const y = Number(msg.y ?? -1);
  return {
    text: `Aether Attack! We have been the target of an Aether Purge by ${attackerName} — we lost control of (${x}, ${y}).`,
    type: "combat",
    severity: "error",
    at: Date.now(),
    ...(x >= 0 && y >= 0 ? { focusX: x, focusY: y, actionLabel: "Center" } : {})
  };
};

export const combatResolutionAlert = (
  msg: Record<string, unknown>,
  context: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined } | undefined,
  deps: {
    playerNameForOwner: (ownerId?: string | null) => string | undefined;
    prettyToken: (value: string) => string;
    resourceLabel: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    terrainAt: (x: number, y: number) => Tile["terrain"];
    tiles: Map<string, Tile>;
    keyFor: (x: number, y: number) => string;
  }
): { title: string; detail: string; tone: "success" | "warn"; manpowerLoss?: number; focusX?: number; focusY?: number; actionLabel?: string } => {
  const attackType = typeof msg.attackType === "string" ? msg.attackType : "";
  const origin = msg.origin as { x: number; y: number } | undefined;
  const target = msg.target as { x: number; y: number } | undefined;
  const attackerWon = Boolean(msg.attackerWon);
  const defenderOwnerId = typeof msg.defenderOwnerId === "string" ? msg.defenderOwnerId : context?.targetTileBefore?.ownerId;
  const changes = (msg.changes as Array<{ x: number; y: number; ownerId?: string; ownershipState?: string }> | undefined) ?? [];
  const manpowerDelta = typeof msg.manpowerDelta === "number" ? msg.manpowerDelta : 0;
  const manpowerLoss = manpowerDelta < -0.01 ? Math.round(Math.abs(manpowerDelta)) : undefined;
  if (attackType === "SETTLE") {
    const settledChange = changes.find((change) => change.ownershipState === "SETTLED");
    const settledTarget = settledChange ? { x: settledChange.x, y: settledChange.y } : target;
    return {
      title: "Settlement Complete",
      detail: `${settledTileLabel(settledTarget, deps)} was settled.`,
      tone: "success",
      ...(settledTarget ? { focusX: settledTarget.x, focusY: settledTarget.y, actionLabel: "Center" } : {})
    };
  }
  const targetOwnerName = playerNameOrFallback(defenderOwnerId, deps);
  const targetTerritoryLabel = territoryLabelForOwner(defenderOwnerId, deps);
  const targetLabel = conqueredTileLabel(context?.targetTileBefore, target, deps);
  if (attackType === "EXPAND" && !defenderOwnerId) {
    return {
      title: "Territory Claimed",
      detail: `${targetLabel} was claimed.`,
      tone: "success",
      ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Center" } : {})
    };
  }
  const manpowerLossDetail = typeof manpowerLoss === "number" ? ` Lost ${manpowerLoss} manpower.` : "";
  if (attackerWon) {
    const plunderDetail = plunderSummary(msg, deps);
    return {
      title: "Victory",
      detail: `${targetLabel} was conquered from ${targetOwnerName}.${plunderDetail ?? ""}${manpowerLossDetail}`,
      tone: "success",
      ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Center" } : {}),
      ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
    };
  }
  const originLost = Boolean(origin && changes.some((change) => change.x === origin.x && change.y === origin.y));
  return {
    title: "Attack Beaten Back",
    detail:
      (originLost && origin
        ? `Attack on ${targetTerritoryLabel} was beaten back and we lost (${origin.x}, ${origin.y}).`
        : `Attack on ${targetTerritoryLabel} was beaten back.`) + manpowerLossDetail,
    tone: "warn",
    ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Center" } : {}),
    ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
  };
};
