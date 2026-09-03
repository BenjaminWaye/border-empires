import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  aiWarReserveManpower,
  AI_AUTO_CLAIM_GOLD_RESERVE,
  EXPAND_MANPOWER_COST,
  FRONTIER_CLAIM_COST
} from "@border-empires/shared";
import type { PlayerCandidateIndex } from "../player-candidate-index/player-candidate-index.js";
import {
  isAutoClaimTarget,
  isSettledTownAnchor,
  TOWN_AUTO_FRONTIER_RADIUS
} from "../territory-automation/territory-automation.js";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";

type TrackSync = <T>(
  phase: string,
  details: Record<string, string | number | boolean | null> | undefined,
  task: () => T
) => T;

export type TickTerritoryAutomationInput = {
  nowMs: number;
  players: Map<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  activeFortAnchorsByOwner: ReadonlyMap<string, ReadonlyMap<string, number>>;
  playerCandidateIndex: PlayerCandidateIndex;
  playerManpowerCap: (player: RuntimePlayer) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  summaryForPlayer: (playerId: string) => unknown;
  applyEconomyAccrual: (player: RuntimePlayer, nowMs: number) => void;
  autoSettlementQueueLengthForPlayer: (playerId: string) => number;
  emitPlayerStateUpdate: (input: { commandId: string; playerId: string }) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  /** When provided, yields the event loop between major phases and between
   *  players so the 30s watchdog never fires on a busy tick. */
  yieldToEventLoop?: () => Promise<void>;
  trackSync?: TrackSync;
};

export const tickTerritoryAutomation = async (input: TickTerritoryAutomationInput): Promise<void> => {
  const yield_ = input.yieldToEventLoop ?? (() => Promise.resolve());
  const track = input.trackSync;
  const _ttaStart = Date.now();
  const autoClaimedKeys = new Set<string>();
  let _claimSummaryForPlayerMs = 0;
  let _claimAnchorScanMs = 0;
  let _claimReplaceTileStateMs = 0;
  let _claimEmitMs = 0;
  let _playersProcessed = 0;
  let _anchorsIterated = 0;
  let _claimCandidatesEvaluated = 0;
  let _tilesActuallyClaimed = 0;
  const MAX_CLAIMS_PER_PLAYER = 8;

  for (const playerId of input.players.keys()) {
    if (playerId.startsWith("barbarian-")) continue;
    const _t0 = Date.now();
    input.summaryForPlayer(playerId);
    const actor = input.players.get(playerId);
    if (!actor) continue;
    input.applyEconomyAccrual(actor, input.nowMs);
    _claimSummaryForPlayerMs += Date.now() - _t0;
    _playersProcessed++;

    const claimDeltas: Array<ReturnType<TickTerritoryAutomationInput["tileDeltaFromState"]>> = [];
    let claimsThisPlayer = 0;
    let claimCommandId: string | undefined;
    const scanAnchors = () => {
      const fortAnchorMap = input.activeFortAnchorsByOwner.get(playerId);
      // Computed once per player, not per anchor, and only when there's at
      // least one anchor to scan: playerManpowerCap iterates every owned
      // town (playerManpowerCapFromSummary), so calling it inside the loop
      // below would make this O(towns^2) per tick for a multi-town empire,
      // and calling it unconditionally would cost every AI player one
      // O(towns) pass per tick even with nothing to claim this tick — this
      // tick runs unconditionally, every tick, for every AI player (per
      // AGENTS.md's AI CPU guardrails).
      const claimManpowerFloor =
        !fortAnchorMap || fortAnchorMap.size === 0
          ? EXPAND_MANPOWER_COST
          : actor.isAi
            ? aiWarReserveManpower(input.playerManpowerCap(actor))
            : EXPAND_MANPOWER_COST;
      for (const anchorKey of (fortAnchorMap ? fortAnchorMap.keys() : [])) {
        _anchorsIterated++;
        const _tAnchor = Date.now();
        const anchor = input.tiles.get(anchorKey);
        if (!anchor) {
          _claimAnchorScanMs += Date.now() - _tAnchor;
          continue;
        }
        const radius = isSettledTownAnchor(anchor, playerId)
          ? TOWN_AUTO_FRONTIER_RADIUS
          : 0;
        if (radius <= 0) {
          _claimAnchorScanMs += Date.now() - _tAnchor;
          continue;
        }
        // AI players reserve AI_AUTO_CLAIM_GOLD_RESERVE gold (claimManpowerFloor,
        // the manpower analogue, is computed once per player above — see its
        // comment) so auto-claim (which runs every tick, unconditionally,
        // well before the AI's own deliberate policy loop) can never outpace
        // the AI's own income/regen and permanently starve it. Human players
        // keep the original FRONTIER_CLAIM_COST/EXPAND_MANPOWER_COST-only
        // floors — this reservation is AI-only.
        const claimGoldFloor = actor.isAi ? AI_AUTO_CLAIM_GOLD_RESERVE : FRONTIER_CLAIM_COST;
        for (const targetKey of input.playerCandidateIndex.claimCandidates(anchorKey, radius)) {
          _claimCandidatesEvaluated++;
          if (actor.points < claimGoldFloor) break;
          if (actor.manpower < claimManpowerFloor) break;
          if (claimsThisPlayer >= MAX_CLAIMS_PER_PLAYER) break;
          if (targetKey === anchorKey || autoClaimedKeys.has(targetKey) || input.locksByTile.has(targetKey)) continue;
          const target = input.tiles.get(targetKey);
          if (!isAutoClaimTarget(target)) continue;
          autoClaimedKeys.add(targetKey);
          actor.points -= FRONTIER_CLAIM_COST;
          actor.manpower -= EXPAND_MANPOWER_COST;
          claimCommandId ??= input.nextTerritoryAutomationCommandId("frontier", playerId, "batch", input.nowMs);
          const claimedTile: DomainTileState = {
            ...target,
            ownerId: playerId,
            ownershipState: "FRONTIER"
          };
          const _tReplace = Date.now();
          input.replaceTileState(targetKey, claimedTile, claimCommandId);
          const _replaceDuration = Date.now() - _tReplace;
          _claimReplaceTileStateMs += _replaceDuration;
          _claimAnchorScanMs -= _replaceDuration;
          claimDeltas.push(input.tileDeltaFromState(claimedTile));
          _tilesActuallyClaimed++;
          claimsThisPlayer++;
        }
        _claimAnchorScanMs += Date.now() - _tAnchor;
      }
    };
    if (track) {
      track("tick_territory_automation_anchor_scan", { playerId }, scanAnchors);
    } else {
      scanAnchors();
    }

    if (claimCommandId && claimDeltas.length > 0) {
      const cmdId: string = claimCommandId;
      const emitClaims = () => {
        const _tEmit = Date.now();
        input.emitEvent({
          eventType: "TILE_DELTA_BATCH",
          commandId: cmdId,
          playerId,
          goldCost: FRONTIER_CLAIM_COST * claimDeltas.length,
          tileDeltas: claimDeltas
        });
        input.emitPlayerStateUpdate({ commandId: cmdId, playerId });
        _claimEmitMs += Date.now() - _tEmit;
      };
      if (track) {
        track("tick_territory_automation_emit", { playerId }, emitClaims);
      } else {
        emitClaims();
      }
    }
    await yield_();
  }

  const _ttaAfterClaim = Date.now();
  let _settleQueueNotifyMs = 0;
  let _settleQueueNotifications = 0;

  for (const [playerId, player] of input.players) {
    // unconditional server-side auto-settle drives this for every player — see runAutoSettleForPlayer
    // in runtime.ts, which settles AI's queue directly instead of just
    // notifying. Skip the notify-only path for AI so it isn't computed twice.
    if (player.isAi) continue;
    if (!playerId.startsWith("barbarian-") && input.autoSettlementQueueLengthForPlayer(playerId) > 0) {
      const notify = () => {
        const _tSettle = Date.now();
        input.emitPlayerStateUpdate({
          commandId: input.nextTerritoryAutomationCommandId("settle-queue", playerId, "batch", input.nowMs),
          playerId
        });
        _settleQueueNotifyMs += Date.now() - _tSettle;
        _settleQueueNotifications++;
      };
      if (track) {
        track("tick_territory_automation_settle_notify", { playerId }, notify);
      } else {
        notify();
      }
      await yield_();
    }
  }

  const _ttaEnd = Date.now();
  const totalMs = _ttaEnd - _ttaStart;
  if (totalMs >= 100) {
    // 2026-07-29 login-stall investigation: claimWallClockMs/settleWallClockMs
    // are Date.now() spans that cross `await yield_()` points (once per
    // player) — a production capture showed claimWallClockMs=13684 with
    // claimBusyMs (this loop's OWN synchronous work) at just 330ms. The
    // other ~13.3s wasn't this loop blocking anything; it was OTHER work
    // (other players' ticks, etc.) running during this loop's own
    // cooperative yields, misattributed to territory automation by wall
    // clock alone. Logging both wall-clock AND busy time side by side so
    // this can never again look like a real bottleneck when it isn't one.
    const claimBusyMs = _claimSummaryForPlayerMs + _claimAnchorScanMs + _claimReplaceTileStateMs + _claimEmitMs;
    const settleBusyMs = _settleQueueNotifyMs;
    input.runtimeLogInfo(
      {
        totalWallClockMs: totalMs,
        totalBusyMs: claimBusyMs + settleBusyMs,
        claimWallClockMs: _ttaAfterClaim - _ttaStart,
        settleWallClockMs: _ttaEnd - _ttaAfterClaim,
        claim: {
          busyMs: claimBusyMs,
          summaryForPlayerMs: _claimSummaryForPlayerMs,
          anchorScanMs: _claimAnchorScanMs,
          replaceTileStateMs: _claimReplaceTileStateMs,
          emitMs: _claimEmitMs,
          playersProcessed: _playersProcessed,
          anchorsIterated: _anchorsIterated,
          claimCandidatesEvaluated: _claimCandidatesEvaluated,
          tilesActuallyClaimed: _tilesActuallyClaimed
        },
        settle: {
          busyMs: settleBusyMs,
          queueNotifyMs: _settleQueueNotifyMs,
          settleQueueNotifications: _settleQueueNotifications
        }
      },
      "[tick_territory_automation] phase breakdown"
    );
  }
};
