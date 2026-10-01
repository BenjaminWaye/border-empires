import {
  BARBARIAN_ATTACKS_PER_MINUTE,
  BARBARIAN_INFLIGHT_TIMEOUT_MS,
  BARBARIAN_TILE_REST_MS,
  MAX_BARBARIAN_TILES
} from "@border-empires/shared";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

export const BARBARIAN_PLAYER_ID = "barbarian-1";
export { MAX_BARBARIAN_TILES };

// A tile that produced no command (no reachable target) is not re-analysed for
// this long, so idle seen tiles don't cost a full analysis on every tick.
const NO_COMMAND_RETRY_MS = 2_000;
const ATTACK_BUDGET_WINDOW_MS = 60_000;
const STATE_CLEANUP_INTERVAL_MS = 60_000;

export type BarbarianPlannerDeps = {
  readonly tilesByKey: ReadonlyMap<string, PlannerTileView>;
  readonly resolveOwnedTiles: (player: PlannerPlayerView) => PlannerTileView[];
  readonly getDockLinksByDockTileKey: () => ReadonlyMap<string, readonly string[]>;
  /** Set of tile keys currently visible to at least one non-barbarian player.
   *  A barb tile is eligible to plan iff its tile key is in this set. Called
   *  once per `choose()`; callers cache + invalidate the union themselves
   *  (vision recomputation is the expensive part — keep it off this hot path). */
  readonly getVisibleToAnyNonBarbPlayer: () => ReadonlySet<string>;
  readonly now?: () => number;
  readonly restMs?: number;
  readonly attacksPerMinute?: number;
  readonly inFlightTimeoutMs?: number;
};

export type BarbarianPlanner = {
  /** Returns at most one command per call. Each barb tile decides on its own:
   *  tiles that have waited longest go first, so a fight elsewhere on the map
   *  can never starve a tile that can only walk. */
  readonly choose: (
    player: PlannerPlayerView,
    clientSeq: number,
    issuedAt: number
  ) => CommandEnvelope | null;
  /** Report that a previously issued command finished (resolved, rejected or
   *  cancelled). Its tiles start their rest period from `settledAt`. */
  readonly settle: (commandId: string, settledAt: number) => void;
  readonly inFlightCount: () => number;
  /** tile key -> time before which the tile may not act again. */
  readonly cooldownByTileKey: ReadonlyMap<string, number>;
};

type InFlightAction = {
  readonly kind: "act" | "erode";
  readonly fromKey: string;
  readonly toKey: string;
  readonly issuedAt: number;
};

type Endpoints = { readonly fromKey: string; readonly toKey: string };

const tileKeyOf = (tile: { x: number; y: number }): string => `${tile.x},${tile.y}`;

const parseEndpoints = (command: CommandEnvelope): Endpoints | undefined => {
  try {
    const payload = JSON.parse(command.payloadJson) as Record<string, unknown>;
    if (
      typeof payload.fromX === "number" && typeof payload.fromY === "number" &&
      typeof payload.toX === "number" && typeof payload.toY === "number"
    ) {
      return { fromKey: `${payload.fromX},${payload.fromY}`, toKey: `${payload.toX},${payload.toY}` };
    }
    if (typeof payload.x === "number" && typeof payload.y === "number") {
      const key = `${payload.x},${payload.y}`;
      return { fromKey: key, toKey: key };
    }
  } catch {
    // ignore — bookkeeping is best-effort
  }
  return undefined;
};

export const createBarbarianPlanner = (deps: BarbarianPlannerDeps): BarbarianPlanner => {
  const now = deps.now ?? (() => Date.now());
  const restMs = deps.restMs ?? BARBARIAN_TILE_REST_MS;
  const attacksPerMinute = deps.attacksPerMinute ?? BARBARIAN_ATTACKS_PER_MINUTE;
  const inFlightTimeoutMs = deps.inFlightTimeoutMs ?? BARBARIAN_INFLIGHT_TIMEOUT_MS;

  // All maps below are bounded by the barbarian's territory (<= MAX_BARBARIAN_TILES
  // plus tiles recently released) and pruned in cleanupState().
  const cooldownByTileKey = new Map<string, number>();
  const lastActedAtByTileKey = new Map<string, number>();
  const noCommandUntilByTileKey = new Map<string, number>();
  const inFlightByCommandId = new Map<string, InFlightAction>();
  const attackIssuedAt: number[] = [];
  let lastCleanupAt = 0;
  let lastWasErosion = false;

  const settle = (commandId: string, settledAt: number): void => {
    const entry = inFlightByCommandId.get(commandId);
    if (!entry) return;
    inFlightByCommandId.delete(commandId);
    const restUntil = settledAt + restMs;
    cooldownByTileKey.set(entry.fromKey, restUntil);
    cooldownByTileKey.set(entry.toKey, restUntil);
  };

  const expireInFlight = (t: number): void => {
    for (const [commandId, entry] of inFlightByCommandId) {
      if (t - entry.issuedAt >= inFlightTimeoutMs) settle(commandId, t);
    }
  };

  const cleanupState = (t: number, ownedTiles: readonly PlannerTileView[]): void => {
    if (t - lastCleanupAt < STATE_CLEANUP_INTERVAL_MS) return;
    lastCleanupAt = t;
    const ownedKeys = new Set<string>();
    for (const tile of ownedTiles) ownedKeys.add(tileKeyOf(tile));
    for (const [key, until] of cooldownByTileKey) if (until <= t && !ownedKeys.has(key)) cooldownByTileKey.delete(key);
    for (const [key, until] of noCommandUntilByTileKey) if (until <= t) noCommandUntilByTileKey.delete(key);
    for (const key of lastActedAtByTileKey.keys()) if (!ownedKeys.has(key)) lastActedAtByTileKey.delete(key);
  };

  const busyTileKeys = (): Set<string> => {
    const busy = new Set<string>();
    for (const entry of inFlightByCommandId.values()) {
      busy.add(entry.fromKey);
      busy.add(entry.toKey);
    }
    return busy;
  };

  const attackBudgetOpen = (t: number): boolean => {
    while (attackIssuedAt.length > 0 && t - attackIssuedAt[0]! >= ATTACK_BUDGET_WINDOW_MS) attackIssuedAt.shift();
    return attackIssuedAt.length < attacksPerMinute;
  };

  const isResting = (key: string, t: number): boolean => (cooldownByTileKey.get(key) ?? 0) > t;

  const record = (command: CommandEnvelope, kind: InFlightAction["kind"], endpoints: Endpoints, t: number): void => {
    inFlightByCommandId.set(command.commandId, { kind, ...endpoints, issuedAt: t });
    lastActedAtByTileKey.set(endpoints.fromKey, t);
    lastActedAtByTileKey.set(endpoints.toKey, t);
  };

  /** Release one of the barbarian's own tiles back to neutral (UNCAPTURE_TILE).
   *  Prefers tiles no player can see so players don't watch barbarians vanish;
   *  falls back to visible tiles only when `allowSeen` is set. */
  const chooseErosion = (
    ownedTiles: readonly PlannerTileView[],
    visible: ReadonlySet<string>,
    allowSeen: boolean,
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    t: number
  ): CommandEnvelope | null => {
    const busy = busyTileKeys();
    for (const tile of ownedTiles) {
      const key = tileKeyOf(tile);
      if (busy.has(key) || isResting(key, t)) continue;
      if (!allowSeen && visible.has(key)) continue;
      const command: CommandEnvelope = {
        commandId: `system-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `system-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "UNCAPTURE_TILE",
        payloadJson: JSON.stringify({ x: tile.x, y: tile.y })
      };
      record(command, "erode", { fromKey: key, toKey: key }, t);
      return command;
    }
    return null;
  };

  /** Per-tile decisions: the tile that has waited longest is considered first and
   *  is analysed on its own, so one tile's available ATTACK never hides another
   *  tile's EXPAND (the frontier planner always prefers ATTACK across the whole
   *  owned set it is given). */
  const chooseAction = (
    ownedTiles: readonly PlannerTileView[],
    visible: ReadonlySet<string>,
    playerId: string,
    clientSeq: number,
    issuedAt: number,
    t: number
  ): CommandEnvelope | null => {
    const busy = busyTileKeys();
    const eligible: Array<{ tile: PlannerTileView; key: string; lastActed: number }> = [];
    for (const tile of ownedTiles) {
      const key = tileKeyOf(tile);
      if (!visible.has(key) || busy.has(key) || isResting(key, t)) continue;
      if ((noCommandUntilByTileKey.get(key) ?? 0) > t) continue;
      eligible.push({ tile, key, lastActed: lastActedAtByTileKey.get(key) ?? 0 });
    }
    if (eligible.length === 0) return null;
    eligible.sort((a, b) => a.lastActed - b.lastActed);

    const canAttack = attackBudgetOpen(t);
    const dockLinksByDockTileKey = deps.getDockLinksByDockTileKey();
    for (const { tile, key } of eligible) {
      const command = chooseNextOwnedFrontierCommandFromLookup(
        deps.tilesByKey,
        [tile],
        playerId,
        clientSeq,
        issuedAt,
        "system-runtime",
        { canAttack, canExpand: true, dockLinksByDockTileKey }
      );
      if (!command) {
        noCommandUntilByTileKey.set(key, t + NO_COMMAND_RETRY_MS);
        continue;
      }
      const endpoints = parseEndpoints(command) ?? { fromKey: key, toKey: key };
      // Target already claimed by an in-flight barb command: try another tile
      // this tick instead of issuing a command that would be rejected as LOCKED.
      if (endpoints.toKey !== key && busy.has(endpoints.toKey)) continue;
      if (command.type === "ATTACK") attackIssuedAt.push(t);
      record(command, "act", endpoints, t);
      return command;
    }
    return null;
  };

  const choose = (
    player: PlannerPlayerView,
    clientSeq: number,
    issuedAt: number
  ): CommandEnvelope | null => {
    const t = now();
    expireInFlight(t);
    const ownedTiles = deps.resolveOwnedTiles(player);
    if (ownedTiles.length === 0) return null;
    cleanupState(t, ownedTiles);

    const visible = deps.getVisibleToAnyNonBarbPlayer();
    const atCap = ownedTiles.length >= MAX_BARBARIAN_TILES;
    const act = (): CommandEnvelope | null =>
      visible.size === 0 ? null : chooseAction(ownedTiles, visible, player.id, clientSeq, issuedAt, t);
    const erode = (allowSeen: boolean): CommandEnvelope | null =>
      chooseErosion(ownedTiles, visible, allowSeen, player.id, clientSeq, issuedAt, t);

    if (!atCap) {
      lastWasErosion = false;
      return act();
    }

    // At/over the cap, alternate between shedding a tile nobody can see and a
    // normal action for the tiles players can see, so the barbarian shrinks
    // toward the cap without freezing in front of players. Seen tiles are only
    // shed when there is nothing else to do.
    const erodeFirst = !lastWasErosion;
    const first = erodeFirst ? erode(false) : act();
    if (first) {
      lastWasErosion = erodeFirst;
      return first;
    }
    const second = erodeFirst ? act() : erode(false);
    if (second) {
      lastWasErosion = !erodeFirst;
      return second;
    }
    const fallback = erode(true);
    lastWasErosion = fallback !== null;
    return fallback;
  };

  return {
    choose,
    settle,
    inFlightCount: () => inFlightByCommandId.size,
    cooldownByTileKey
  };
};
