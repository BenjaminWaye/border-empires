import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { FrontierCommandResult } from "../runtime-frontier-command.js";
import { MUSTER_BASE_RATE_PER_MIN, MUSTER_STALE_MS } from "@border-empires/shared";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";
import type { MusterAdvanceCooldowns } from "./muster-auto-fire-shared.js";
import { maybeAdvanceFire } from "./muster-advance-fire.js";
import { maybeMarchFire } from "./runtime-muster-march.js";
import { musterSpeedMultiplier, outpostTileKeysForPlayer, type Position } from "./muster-depot-speed.js";
import { musterPoolFloorFor } from "../ai-build-manpower-floor.js";
import { creditManpower } from "../runtime-manpower-ceiling.js";

export type { MusterAdvanceCooldowns } from "./muster-auto-fire-shared.js";
export type { Position } from "./muster-depot-speed.js";

export type MusterTickInput = {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  musterTilesByOwner: ReadonlyMap<string, Set<string>>;
  activeSiegeOutpostsByOwner: ReadonlyMap<string, Set<string>>;
  activeRelayBeaconsByOwner: ReadonlyMap<string, Set<string>>;
  // Resolved per flag owner on demand (see railDepotPositionsForPlayer), not
  // precomputed for every owner on every tick.
  railDepotPositionsForPlayer: (playerId: string) => ReadonlyArray<Position>;
  applyManpowerRegen: (player: RuntimePlayer, nowMs: number) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  // Pushes a PLAYER_UPDATE (incl. eventLog) -- used when a barbarian hunt
  // finishes so the BARBARIANS_CLEARED entry reaches the player right away.
  emitPlayerStateUpdate: (input: { commandId: string; playerId: string }) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  // ADVANCE auto-fire wiring.
  requiredMusterForTarget: (target: DomainTileState) => number;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => FrontierCommandResult;
  // Active combat locks (keyed by origin/target tile) so ADVANCE can skip tiles
  // already committed to a fight and enforce one attack in flight per flag via
  // LockRecord.musterSourceKey.
  locksByTile: ReadonlyMap<string, LockRecord>;
  // Per-flag cooldown state (mutated in place, lives on the Runtime instance).
  advanceCooldowns: MusterAdvanceCooldowns;
  // Dock crossings (owned dock tile -> linked dock tile keys) so ADVANCE's BFS
  // can reach across water the same way manual ATTACK/EXPAND commands do.
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  // Active aether bridge crossings for a given player (bridge endpoint tile
  // key -> linked endpoint tile keys), so ADVANCE/MARCH's BFS can cross a
  // connected aether bridge the same way manual ATTACK/EXPAND commands do,
  // instead of only ever walking plain adjacency through owned territory.
  aetherBridgeNeighborKeysForPlayer: (playerId: string) => ReadonlyMap<string, readonly string[]>;
  // §5.4: a dormant Siege/Relay Beacon doesn't grant the muster
  // depot-speed/Rail-Depot-boost bonus.
  isStructureDormant: (playerId: string, tileKey: string, field: "siegeOutpost" | "economicStructure") => boolean;
  // MARCH's neutral-tile expansion fallback (runtime-muster-march.ts) only
  // considers a candidate tile inside the player's own reach — EXPAND is not
  // reach-gated server-side, but letting auto-fire claim ground outside reach
  // would grow territory faster than a player manually could, so the
  // automation path holds itself to a tighter bar than the command it issues.
  isInReach: (playerId: string, x: number, y: number) => boolean;
};

export type MusterTickContext = Omit<MusterTickInput, "nowMs" | "musterTilesByOwner">;

/**
 * Builds the two tick entry points Runtime calls (`tickMuster` every server
 * tick, `tickWatchedMusterTiles` on demand for actively-viewed flags) so the
 * orchestration — and the watched-tile filtering — lives next to the muster
 * logic itself instead of inline on the Runtime class.
 *
 * `buildContext` and the tile-map getters are passed in as closures (rather
 * than a plain snapshot) because several fields (e.g. rail depot positions)
 * must be recomputed fresh from current Runtime state on every call.
 */
export const createMusterTickRunner = (
  buildContext: (musterTilesByOwner: ReadonlyMap<string, Set<string>>) => MusterTickContext,
  getMusterTilesByOwner: () => ReadonlyMap<string, Set<string>>,
  getWatchedMusterTileByPlayer: () => ReadonlyMap<string, string>
): {
  tickMuster: (nowMs: number) => void;
  tickWatchedMusterTiles: (nowMs: number) => void;
  tickMusterForPlayer: (playerId: string, nowMs: number) => void;
} => ({
  tickMuster: (nowMs: number): void => {
    const musterTilesByOwner = getMusterTilesByOwner();
    tickMuster({ nowMs, musterTilesByOwner, ...buildContext(musterTilesByOwner) });
  },
  // Re-ticks one player's own muster flags on demand, right after a command
  // mutates one of them (e.g. SET_MUSTER) — so the command's own tile delta
  // already carries a correct amount/ratePerMin instead of the player
  // waiting up to 30s for the next tickMuster sweep to stamp one. Passes the
  // player's *entire* flag set (not just the one just touched), same as
  // tickWatchedMusterTiles, so activeMusterCount's throughput split is
  // recomputed correctly across all of that player's flags, not just one.
  tickMusterForPlayer: (playerId: string, nowMs: number): void => {
    const allMusterTilesByOwner = getMusterTilesByOwner();
    const playerTiles = allMusterTilesByOwner.get(playerId);
    if (!playerTiles || playerTiles.size === 0) return;
    const filteredMusterTiles = new Map<string, Set<string>>([[playerId, playerTiles]]);
    tickMuster({ nowMs, musterTilesByOwner: filteredMusterTiles, ...buildContext(filteredMusterTiles) });
  },
  tickWatchedMusterTiles: (nowMs: number): void => {
    const watched = getWatchedMusterTileByPlayer();
    // Build a filtered view of musterTilesByOwner containing only watched players.
    // Passing all of each player's muster tiles preserves the throughput-split
    // calculation (activeMusterCount) across their flags.
    const allMusterTilesByOwner = getMusterTilesByOwner();
    const filteredMusterTiles = new Map<string, Set<string>>();
    for (const [playerId, tileKey] of watched) {
      const playerTiles = allMusterTilesByOwner.get(playerId);
      if (!playerTiles?.has(tileKey)) continue;
      filteredMusterTiles.set(playerId, playerTiles);
    }
    if (filteredMusterTiles.size > 0) {
      tickMuster({ nowMs, musterTilesByOwner: filteredMusterTiles, ...buildContext(filteredMusterTiles) });
    }
    // Every other human ADVANCE/MARCH flag gets a fire-only pass on this
    // same 1s cadence -- see tickMusterAutoFire.
    const autoFireTiles = humanAutoFireMusterTiles(allMusterTilesByOwner, filteredMusterTiles, buildContext);
    if (autoFireTiles) tickMusterAutoFire({ nowMs, musterTilesByOwner: autoFireTiles.musterTilesByOwner, ...autoFireTiles.context });
  }
});

/**
 * Picks out the human players (other than `exclude`, already fully ticked)
 * who have at least one ADVANCE/MARCH flag, and builds their tick context --
 * or undefined when there are none, so an idle server never pays for
 * buildContext. AI flags stay on the 30s territory-automation cadence: their
 * planner already budgets around it, and speeding them up 30x would be a
 * balance change nobody asked for.
 */
const humanAutoFireMusterTiles = (
  allMusterTilesByOwner: ReadonlyMap<string, Set<string>>,
  exclude: ReadonlyMap<string, Set<string>>,
  buildContext: (musterTilesByOwner: ReadonlyMap<string, Set<string>>) => MusterTickContext
): { musterTilesByOwner: Map<string, Set<string>>; context: MusterTickContext } | undefined => {
  let candidates: Map<string, Set<string>> | undefined;
  let context: MusterTickContext | undefined;
  for (const [playerId, musterKeys] of allMusterTilesByOwner) {
    if (exclude.has(playerId) || musterKeys.size === 0) continue;
    context ??= buildContext(allMusterTilesByOwner);
    if (context.players.get(playerId)?.isAi !== false) continue;
    let hasAutoFireFlag = false;
    for (const tileKey of musterKeys) {
      const mode = context.tiles.get(tileKey)?.muster?.mode;
      if (mode === "ADVANCE" || mode === "MARCH") { hasAutoFireFlag = true; break; }
    }
    if (!hasAutoFireFlag) continue;
    candidates ??= new Map<string, Set<string>>();
    candidates.set(playerId, musterKeys);
  }
  return candidates && context ? { musterTilesByOwner: candidates, context } : undefined;
};

/**
 * Fire-only pass for ADVANCE/MARCH flags: runs the same auto-fire search
 * tickMuster does, but skips manpower accrual (and the tile delta every
 * accrual step emits), so it is cheap to run every second.
 *
 * Without this an unwatched flag could only launch one action per 30s
 * territory-automation sweep -- a MARCH that had to expand ten tiles toward
 * a target took five minutes, and the player had to keep the flag's tile
 * menu open (which is what "watching" it means) to make it act promptly.
 * Accrual stays on the slower sweep; the per-flag cooldowns in
 * advanceCooldowns still gate how often the search itself actually runs.
 */
export const tickMusterAutoFire = (input: MusterTickInput): void => {
  for (const [playerId, musterKeys] of input.musterTilesByOwner) {
    for (const tileKey of musterKeys) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.muster || tile.muster.ownerId !== playerId) continue;
      if (tile.muster.setAt != null && input.nowMs - tile.muster.setAt > MUSTER_STALE_MS) continue;
      if (tile.muster.mode === "ADVANCE") maybeAdvanceFire(input, tile, playerId);
      else if (tile.muster.mode === "MARCH") maybeMarchFire(input, tile, playerId);
    }
  }
};

/**
 * Accumulation tick for the mustering system. The player's manpower regen rate
 * is split evenly across all active flags (depot bonus applied per tile).
 *
 * D20 (docs/replenishment-update-plan.md): a flag has no cap of its own any
 * more (removed 2026-09-26, along with "Expand Capacity"/UPGRADE_MUSTER_CAP
 * and capLevel) — it fills until the player's manpower pool runs dry.
 *
 * Stale musters (set more than MUSTER_STALE_MS ago) are auto-cleared with a
 * full manpower refund so the pool doesn't stay permanently locked.
 *
 */
export const tickMuster = (input: MusterTickInput): void => {
  for (const [playerId, musterKeys] of input.musterTilesByOwner) {
    if (musterKeys.size === 0) continue;
    const player = input.players.get(playerId);
    if (!player) continue;

    input.applyManpowerRegen(player, input.nowMs);

    const outpostKeys = outpostTileKeysForPlayer(input, playerId);
    const depotPositions = input.railDepotPositionsForPlayer(playerId);

    // Count non-stale flags so throughput is split evenly across them.
    let activeMusterCount = 0;
    for (const tileKey of musterKeys) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.muster || tile.muster.ownerId !== playerId) continue;
      if (tile.muster.setAt != null && input.nowMs - tile.muster.setAt > MUSTER_STALE_MS) continue;
      activeMusterCount++;
    }
    if (activeMusterCount === 0) continue;

    const musterPoolFloor = musterPoolFloorFor(player);
    const batchCommandId = `muster-tick:${playerId}:${input.nowMs}`;
    const batchDeltas: ReturnType<MusterTickInput["tileDeltaFromState"]>[] = [];

    for (const tileKey of musterKeys) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.muster || tile.muster.ownerId !== playerId) continue;

      // Auto-clear stale musters and refund the manpower to the pool.
      if (tile.muster.setAt != null && input.nowMs - tile.muster.setAt > MUSTER_STALE_MS) {
        creditManpower(player, tile.muster.amount, input.playerManpowerCap(player));
        const clearedTile: DomainTileState = { ...tile, muster: undefined };
        input.replaceTileState(tileKey, clearedTile);
        batchDeltas.push({ ...input.tileDeltaFromState(clearedTile), musterJson: "" });
        continue;
      }

      const elapsedMin = Math.max(0, (input.nowMs - tile.muster.updatedAt) / 60_000);
      const depotMult = musterSpeedMultiplier(tile, outpostKeys, depotPositions);
      const wonderMusterRateMult = player.wonderMusterRateMultiplier ?? 1;
      const rawRatePerMin = (MUSTER_BASE_RATE_PER_MIN / activeMusterCount) * depotMult * wonderMusterRateMult;
      // AI flags may only draw pool manpower above the build floor (see
      // ai-build-manpower-floor.ts); ratePerMin above stays the nominal rate so
      // the client's interpolation is unaffected.
      const drawable = Math.max(0, player.manpower - musterPoolFloor);
      const inflow = Math.min(rawRatePerMin * elapsedMin, drawable);
      // Quantized to ~3 decimals so the client's local-clock interpolation
      // has a stable, near-jitter-free rate to extrapolate against, and so
      // an unstable float doesn't defeat an equality guard and cause
      // unbounded re-emission (the exact failure mode behind outage 8d4f9e6).
      const ratePerMin = Math.round(rawRatePerMin * 1000) / 1000;

      let currentTile = tile;
      if (inflow > 0.0001) {
        player.manpower -= inflow;
        currentTile = {
          ...tile,
          muster: {
            ...tile.muster,
            amount: tile.muster.amount + inflow,
            updatedAt: input.nowMs,
            ratePerMin
          }
        };
        input.replaceTileState(tileKey, currentTile);
        batchDeltas.push(input.tileDeltaFromState(currentTile));
      } else if (tile.muster.ratePerMin !== ratePerMin) {
        // The rate itself changed (a brand-new flag has no ratePerMin yet,
        // or a sibling flag joined/left and shifted this one's throughput
        // share) even though there's no inflow to apply right now — the
        // client still needs this delta to know the new rate, so (unlike
        // the silent elapsedMin-only branch below) this one emits. This is
        // what lets tickMusterForPlayer (called right after SET_MUSTER)
        // give a brand-new flag a correct ratePerMin on its very first
        // sample instead of waiting for the next periodic sweep.
        currentTile = {
          ...tile,
          muster: { ...tile.muster, updatedAt: input.nowMs, ratePerMin }
        };
        input.replaceTileState(tileKey, currentTile);
        batchDeltas.push(input.tileDeltaFromState(currentTile));
      } else if (elapsedMin > 0) {
        // Rate is unchanged and there's no inflow (pool empty) -- just
        // re-stamp updatedAt so elapsed time doesn't silently accumulate,
        // without emitting a delta (deliberate: avoids repeat network
        // chatter for an idle flag with nothing new to report).
        currentTile = {
          ...tile,
          muster: { ...tile.muster, updatedAt: input.nowMs, ratePerMin }
        };
        input.replaceTileState(tileKey, currentTile);
      }

      // ADVANCE/MARCH auto-fire runs regardless of inflow so a full flag still strikes.
      if (currentTile.muster?.mode === "ADVANCE") {
        maybeAdvanceFire(input, currentTile, playerId);
      } else if (currentTile.muster?.mode === "MARCH") {
        maybeMarchFire(input, currentTile, playerId);
      }
    }

    if (batchDeltas.length > 0) {
      input.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: batchCommandId,
        playerId,
        playerManpower: player.manpower,
        tileDeltas: batchDeltas
      });
    }
  }
};
// musterSpeedMultiplier / outpostTileKeysForPlayer: see muster-depot-speed.ts.

