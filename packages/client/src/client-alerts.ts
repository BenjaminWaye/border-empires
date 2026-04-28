import { FRONTIER_CLAIM_COST } from "@border-empires/shared";
import { formatGoldAmount } from "./client-constants.js";
import { resourceIconForKey } from "./client-map-display.js";
import { maybeRegisterShardRainPing } from "./client-shard-rain-pings.js";
import type { ClientState } from "./client-state.js";
import type { ClientShardRainAlert } from "./client-shard-alert.js";
import type { FeedEntry, FeedSeverity, FeedType, Tile } from "./client-types.js";

export const pushFeed = (state: Pick<ClientState, "feed">, msg: string, type: FeedType = "info", severity: FeedSeverity = "info"): void => {
  state.feed.unshift({ text: msg, type, severity, at: Date.now() });
  state.feed = state.feed.slice(0, 18);
};

export const pushFeedEntry = (state: Pick<ClientState, "feed">, entry: FeedEntry): void => {
  state.feed.unshift(entry);
  state.feed = state.feed.slice(0, 18);
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
  state: Pick<ClientState, "dismissedShardAlertKeys" | "shardAlert">,
  alert: ClientShardRainAlert
): void => {
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
  state: Pick<ClientState, "gold" | "captureAlert" | "feed">,
  action: "claim" | "attack"
): void => {
  const label = action === "claim" ? "Frontier claim" : "Attack";
  const detail = `${label} costs ${formatGoldAmount(FRONTIER_CLAIM_COST)} gold. You have ${formatGoldAmount(state.gold)}.`;
  showCaptureAlert(state, "Insufficient gold", detail, "error");
  pushFeed(state, detail, "combat", "warn");
};

export const showCollectVisibleCooldownAlert = (
  state: Pick<ClientState, "captureAlert" | "collectVisibleCooldownUntil">,
  formatCooldownShort: (ms: number) => string
): void => {
  const remaining = state.collectVisibleCooldownUntil - Date.now();
  if (remaining <= 0) return;
  state.captureAlert = {
    title: "Collect Visible Cooldown",
    detail: `Retry in ${formatCooldownShort(remaining)}.`,
    until: state.collectVisibleCooldownUntil,
    tone: "warn"
  };
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

const plunderSummary = (
  msg: Record<string, unknown>,
  deps: { prettyToken: (value: string) => string }
): string | undefined => {
  const pillagedGold = typeof msg.pillagedGold === "number" ? msg.pillagedGold : 0;
  const strategic = (msg.pillagedStrategic as Record<string, number> | undefined) ?? {};
  const parts: string[] = [];
  if (pillagedGold > 0.01) parts.push(`${resourceIconForKey("GOLD")} ${formatGoldAmount(pillagedGold)}`);
  for (const resource of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"] as const) {
    const amount = strategic[resource];
    if (typeof amount !== "number" || amount <= 0.01) continue;
    parts.push(`${resourceIconForKey(resource)} ${formatPlunderAmount(amount)} ${deps.prettyToken(resource)}`);
  }
  if (parts.length === 0) return undefined;
  return ` Plundered ${parts.join(", ")}.`;
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
  if (attackerWon) {
    const plunderDetail = plunderSummary(msg, deps);
    return {
      title: "Victory",
      detail: `${targetLabel} was conquered from ${targetOwnerName}.${plunderDetail ?? ""}`,
      tone: "success",
      ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Center" } : {}),
      ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
    };
  }
  const originLost = Boolean(origin && changes.some((change) => change.x === origin.x && change.y === origin.y));
  return {
    title: "Attack Beaten Back",
    detail:
      originLost && origin
        ? `Attack on ${targetTerritoryLabel} was beaten back and we lost (${origin.x}, ${origin.y}).`
        : `Attack on ${targetTerritoryLabel} was beaten back.`,
    tone: "warn",
    ...(target ? { focusX: target.x, focusY: target.y, actionLabel: "Center" } : {}),
    ...(typeof manpowerLoss === "number" ? { manpowerLoss } : {})
  };
};
