import type { DomainTileState } from "@border-empires/game-domain";
import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import { capturedStructureFields } from "./capture-structures/capture-structures.js";
import { capturedTownAftermath } from "./runtime-capture-aftermath.js";
import { capturedTileWillAutoSettle } from "./runtime-out-of-reach-auto-settle/runtime-out-of-reach-auto-settle.js";
import { isAiControlledActor } from "./runtime-player-factory.js";
import { FORT_PATROL_GRACE_MS } from "./territory-automation/territory-automation.js";
import { flipFeatures } from "./territory-flip-log/territory-flip-features.js";
import type { SimulationTileWireDelta, LockRecord } from "./runtime-types.js";
import type { RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";
/** One capture pipeline for regular wins and non-recursive Breakthrough capitulation. */
export function applyWinningTileCapture(context: RuntimeLockResolutionContext, lock: LockRecord, previousTarget: DomainTileState | undefined, combatBroadcastJson?: string): number | undefined {
  const previousOwnerId = previousTarget?.ownerId;
  const attacker = context.players.get(lock.playerId);
    const townAftermath = capturedTownAftermath(previousTarget?.town, previousOwnerId, lock.playerId, context.now());
    const settlementRelocationPopulation = townAftermath.settlementRelocationPopulation;
    // Barbarians resolve to SETTLED (below) and are never reach-gated.
    const targetBeyondReach = lock.playerId !== "barbarian-1" && context.isTileBeyondReach(lock.playerId, lock.targetX, lock.targetY);
    // Towns/docks (reach anchors) and forts/observatories/economic structures
    // (buildings) try to auto-settle instead of landing plain FRONTIER -- see
    // capturedTileWillAutoSettle's doc comment for why each qualifies.
    const isAnchorStructureTile = Boolean(townAftermath.town) || Boolean(previousTarget?.dockId);
    const capturedFields = capturedStructureFields(previousTarget, lock.playerId, context.now());
    const hasCapturedBuilding = Boolean(capturedFields.fort) || Boolean(capturedFields.observatory) || Boolean(capturedFields.economicStructure) || Boolean(capturedFields.afc);
    const willAutoSettle = capturedTileWillAutoSettle({
      playerId: lock.playerId,
      isAnchorStructureTile,
      hasCapturedBuilding,
      targetBeyondReach,
      canAutoSettleCapturedAnchor: context.canAutoSettleCapturedAnchor,
      ...(context.isTownAutoSettleAllowed ? { isAnchorAutoSettleAllowed: context.isTownAutoSettleAllowed } : {})
    });
    const resolvedTarget: DomainTileState = {
      x: lock.targetX,
      y: lock.targetY,
      terrain: previousTarget?.terrain ?? "LAND",
      ...(previousTarget?.resource ? { resource: previousTarget.resource } : {}),
      ...(previousTarget?.prospectSignature ? { prospectSignature: previousTarget.prospectSignature } : {}),
      ...(previousTarget?.dockId ? { dockId: previousTarget.dockId } : {}),
      ...(previousTarget?.shardSite ? { shardSite: previousTarget.shardSite } : {}),
      ...(previousTarget?.naturalWonder ? { naturalWonder: previousTarget.naturalWonder } : {}),
      ...(previousTarget?.watchtower ? { watchtower: previousTarget.watchtower } : {}),
      ...(previousTarget?.waystation ? { waystation: previousTarget.waystation } : {}),
      ...(townAftermath.town ? { town: townAftermath.town } : {}),
      ...capturedFields,
      ownerId: lock.playerId,
      // willAutoSettle doesn't flip this to SETTLED itself:
      // autoSettleCapturedAnchor kicks off the same async settlement process
      // a manual SETTLE would (cost charged now, ownershipState flips once
      // startSettlementProcess's timer resolves).
      ownershipState: lock.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER",
      // Capture hold (shared capture-hold.ts): a tile won from another player
      // defends for a while instead of being a free 100% retake.
      ...(lock.actionType === "ATTACK" && lock.playerId !== "barbarian-1" && previousOwnerId && previousOwnerId !== lock.playerId && previousOwnerId !== "barbarian-1"
        ? { captureHoldUntil: context.now() + CAPTURE_HOLD_MS }
        : {})
    };
    // Capturing a tile destroys any muster flag staged on it — the accumulated
    // manpower is lost, not refunded to the previous owner's pool. resolvedTarget
    // never carries `muster` forward (see the object literal above), so the flag
    // itself is already gone; this just drops the pooled manpower with it.
    const hadMuster = Boolean(previousTarget?.muster);
    context.replaceTileState(lock.targetKey, resolvedTarget, lock.commandId);
    if (previousTarget?.town && previousOwnerId && previousOwnerId !== lock.playerId && townAftermath.populationBefore !== undefined && townAftermath.populationAfter !== undefined) {
      const capturedStructureTypes = [
        ...(capturedFields.fort ? ["FORT"] : []),
        ...(capturedFields.observatory ? ["OBSERVATORY"] : []),
        ...(capturedFields.siegeBattery ? ["SIEGE_BATTERY"] : []),
        ...(capturedFields.economicStructure ? [capturedFields.economicStructure.type] : [])
      ];
      const townImpact = {
        ...(previousTarget.town.name ? { townName: previousTarget.town.name } : {}),
        townTier: previousTarget.town.populationTier,
        townSurvived: Boolean(townAftermath.town),
        populationBefore: townAftermath.populationBefore,
        populationAfter: townAftermath.populationAfter,
        capturedStructureTypes
      };
      const occurredAt = context.now();
      context.recordPersonalImpact?.({ id: `town-captured:${lock.commandId}`, kind: "TOWN_CAPTURED", playerId: lock.playerId, occurredAt, x: lock.targetX, y: lock.targetY, ...townImpact });
      context.recordPersonalImpact?.({ id: `town-lost:${lock.commandId}`, kind: "TOWN_LOST", playerId: previousOwnerId, occurredAt, x: lock.targetX, y: lock.targetY, ...townImpact });
    }
    if (previousOwnerId !== resolvedTarget.ownerId) {
      context.recordTileFlip?.({
        tileId: lock.targetKey,
        x: lock.targetX,
        y: lock.targetY,
        fromOwner: previousOwnerId,
        toOwner: resolvedTarget.ownerId,
        at: context.now(),
        ...flipFeatures(previousTarget)
      });
    }
    if (willAutoSettle) context.autoSettleCapturedAnchor(lock.playerId, lock.targetKey, resolvedTarget, lock.commandId);
    if (resolvedTarget.ownershipState === "FRONTIER") context.extendFortPatrolGrace(lock.targetKey, context.now() + FORT_PATROL_GRACE_MS);
    else context.clearFortPatrolGrace(lock.targetKey);
    // Watchtower/waystation activation is keyed off "does this player now own
    // a dormant one", not the action type that won them the tile -- both are
    // world-generated without regard to prior ownership, so an ATTACK-won
    // capture (e.g. of barbarian-held frontier land) can carry one just as
    // easily as an EXPAND onto neutral land. Both activation functions are
    // one-shot no-ops if the tile has none or it's already activated, so
    // calling them unconditionally here is safe.
    context.maybeActivateWatchtower(lock.targetKey, lock.targetX, lock.targetY, lock.playerId, lock.commandId);
    context.maybeActivateWaystation(lock.targetKey, lock.targetX, lock.targetY, lock.playerId, lock.commandId);
    if (lock.actionType === "EXPAND") {
      if (resolvedTarget.ownershipState === "FRONTIER") {
        context.maybeDrainClaimContinuation(lock.targetKey, lock.targetX, lock.targetY, lock.playerId);
      }
    }
    const finalResolvedTarget = context.tiles.get(lock.targetKey) ?? resolvedTarget;

    let tileDeltas: SimulationTileWireDelta[];
    // Only human captors get the vision-radius capture-reveal square; AI-
    // controlled actors (autopilot "ai-<n>" AND the barbarian faction) have no
    // WS subscriber, so building/broadcasting an (2r+1)² reveal block for them
    // is pure waste. Barbarians roam neutral wilderness, so that block is dozens
    // of ownerId:null deltas that the broadcast path forwards to every human as
    // ownership-clears (visibility filter's includeOwnershipClears), flooding
    // clients with mid-map neutral tiles on every barbarian capture. Keying off
    // isAiControlledActor rather than attacker.isAi is load-bearing: barbarians
    // carry isAi:false by design (see runtime-player-factory.ts).
    //
    // EXPAND and ATTACK both skip the full scan: both target tiles adjacent
    // to territory the player already had vision over, so a (2r+1)² reveal
    // scan finds nothing new — it was only ever paying for redundant re-sends
    // of already-revealed tiles. With observatory/tech vision-radius bonuses
    // this scan can hit 400+ tiles per single-tile capture, which
    // synchronously blocks the sim's event loop for 150-800ms+ and has caused
    // gateway submit timeouts (SIMULATION_UNAVAILABLE) during rapid-fire
    // expand chains.
    // The previous owner (if this was a real capture, not an EXPAND onto
    // neutral land) just lost this exact tile and needs to see its resolved
    // state — including any muster flag being cleared — even if losing it
    // dropped their fog-of-war coverage in the same instant. See
    // SimulationTileWireDelta.forceVisibleForPlayerId's doc comment.
    const capturedFromPlayerId = previousOwnerId && previousOwnerId !== lock.playerId ? previousOwnerId : undefined;
    if (isAiControlledActor(lock.playerId, attacker?.isAi) || lock.actionType === "EXPAND" || lock.actionType === "ATTACK") {
      const baseTargetDelta = {
        ...context.tileDeltaFromState(finalResolvedTarget),
        ...(combatBroadcastJson ? { combatJson: combatBroadcastJson } : {})
      };
      // ATTACK only requires the origin to be owned by the attacker, not the
      // target to currently be inside their own live vision -- a deep raid
      // chained through previously-claimed (possibly out-of-reach/decaying)
      // frontier ground can capture a tile the attacker has no coverage of at
      // all. Without forcing it visible to them too, this delta -- including
      // any muster flag being cleared -- gets silently dropped by
      // tile-delta-visibility-filter.ts for the attacker themselves, leaving
      // their own client showing the previous owner's stale muster flag on a
      // tile that's now theirs. Both the attacker and the previous owner can
      // need this forced past their own visibility check, so this is one
      // delta with an array of forced ids, not two duplicate delta objects
      // (which would double-deliver it to a bystander who already has real
      // vision of the tile). See SimulationTileWireDelta.forceVisibleForPlayerId's
      // doc comment.
      tileDeltas = [{
        ...baseTargetDelta,
        forceVisibleForPlayerId: capturedFromPlayerId ? [lock.playerId, capturedFromPlayerId] : lock.playerId
      }];
    } else {
      const measure = Boolean(context.onCaptureRevealBuilt);
      const startedAt = measure ? context.now() : 0;
      tileDeltas = context.buildCaptureRevealTileDeltas(lock.playerId, lock.targetX, lock.targetY);
      if (capturedFromPlayerId) {
        const targetIndex = tileDeltas.findIndex((delta) => delta.x === lock.targetX && delta.y === lock.targetY);
        if (targetIndex >= 0) tileDeltas[targetIndex]!.forceVisibleForPlayerId = capturedFromPlayerId;
      }
      if (measure) {
        context.onCaptureRevealBuilt?.({
          commandId: lock.commandId,
          playerId: lock.playerId,
          tileCount: tileDeltas.length,
          durationMs: Math.max(0, context.now() - startedAt)
        });
      }
    }
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: lock.commandId, playerId: lock.playerId, tileDeltas });
    const breachedTiles = context.applyBreachToNeighbors?.(resolvedTarget, lock.playerId);
    if (breachedTiles && breachedTiles.length > 0) {
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `breach:${lock.targetKey}:${context.now()}`,
        playerId: "__broadcast__",
        tileDeltas: breachedTiles.map((t) => context.tileDeltaFromState(t))
      });
    }
    if (hadMuster) {
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: `${lock.commandId}:bc`,
        playerId: "__broadcast__",
        tileDeltas: [{ x: resolvedTarget.x, y: resolvedTarget.y, ownerId: resolvedTarget.ownerId, ownershipState: resolvedTarget.ownershipState, musterJson: "" }]
      });
    }
    if (lock.playerId === "barbarian-1") context.applyBarbarianWalkOrMultiply(lock, previousTarget);
    else if (previousTarget?.ownerId === "barbarian-1") context.barbarianTileProgress.delete(lock.targetKey);
    return settlementRelocationPopulation;
}
