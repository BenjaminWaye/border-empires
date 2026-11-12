// Server-side auto-improve: each territory-automation tick, for a player whose
// auto-improve switch is on for a resource (shared auto-improve-prefs.ts),
// builds that resource's improvement on their garrisoned tiles of it -- e.g.
// a Mine on every titanium tile. It removes the click, not any rule: the
// build goes through the ordinary BUILD_STRUCTURE handler with the same
// coin/manpower cost, tech, resource slot and development slot checks.
//
// Candidates come from RuntimeOwnerTileIndexes.improvableTilesByOwner (bare,
// garrisoned resource tiles), so a tick never scans the whole map. Each check
// below mirrors one the build handler makes, so a tile that can't be built
// yet is skipped quietly and retried next tick instead of producing a
// COMMAND_REJECTED; one the handler refuses anyway is dropped until the tile
// next changes. Garrisoning runs first in the same tick, so it gets the
// development slots before improvements do. A structure the player removes
// is not rebuilt (see the index's removal rule).
import type { DomainPlayer } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import {
  autoImproveStructureForResource,
  isAutoImproveResource,
  STRUCTURE_REGISTRY,
  structureBuildGoldCost,
  type BuildableStructureType
} from "@border-empires/shared";
import { isImprovableResourceTile } from "./improvable-resource-tile.js";
import { emptyResourceSlotTotals } from "../resource-slot-view/resource-slot-view.js";
import { devQueueBuildReservationContext, reservedSlotDemandForQueue } from "../runtime-dev-queue-build-reservation.js";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";
import { handleBuildStructureCommand, type RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";

const isAfcModuleTech = (techId: string): boolean => techEntryById.get(techId)?.manifestCategory === "AFC_MODULE";

/** The build handler's AFC_MODULE gate, read from the player's own AFC tiles rather than the whole map. */
const hasActiveAfcModule = (context: RuntimeStructureCommandContext, afcTileKeys: ReadonlySet<string> | undefined, techId: string): boolean =>
  [...(afcTileKeys ?? [])].some((key) => {
    const afc = context.tiles.get(key)?.afc;
    return afc?.status === "active" && !!afc.modules?.includes(techId);
  });

/** Builds started per player per tick, so one tick never floods a big empire's slots in one go. */
export const AUTO_IMPROVE_MAX_BUILDS_PER_TICK = 3;

export type AutoImproveDeps = {
  players: ReadonlyMap<string, DomainPlayer>;
  /** Built only for a player with a switch on and a candidate tile. */
  structureContext: () => RuntimeStructureCommandContext;
  /** A tile whose build the handler refuses anyway is dropped from here until its next change re-adds it. */
  improvableTilesByOwner: ReadonlyMap<string, Set<string>>;
  hasAvailableDevelopmentSlot: (playerId: string) => boolean;
};

/** Starts up to AUTO_IMPROVE_MAX_BUILDS_PER_TICK improvements for one player; returns how many started. */
export const runAutoImproveForPlayer = (deps: AutoImproveDeps, playerId: string, nowMs: number): number => {
  const actor = deps.players.get(playerId);
  const improve = actor?.autoSettle?.improve;
  if (!actor || !improve || !Object.values(improve).some(Boolean)) return 0;
  const candidates = deps.improvableTilesByOwner.get(playerId);
  if (!candidates || candidates.size === 0) return 0;
  const context = deps.structureContext();
  const summary = context.summaryForPlayer?.(playerId);
  // The build handler requires an operational AFC.
  if (summary && summary.ownedAfcTileKeys.size === 0) return 0;
  const queuedTileKeys = new Set(summary?.devQueue.map((entry) => entry.tileKey) ?? []);
  // Slots already promised to the player's own queued builds stay theirs.
  const queuedSlotDemand = summary ? reservedSlotDemandForQueue(summary.devQueue) : emptyResourceSlotTotals();
  const reservations = devQueueBuildReservationContext(context);
  // A structure type that can't be afforded or slotted now won't be on its next tile either.
  const blockedTypes = new Set<BuildableStructureType>();
  let started = 0;
  // Copied: each dispatched build takes its tile out of the index.
  for (const tileKey of [...candidates]) {
    if (started >= AUTO_IMPROVE_MAX_BUILDS_PER_TICK || !deps.hasAvailableDevelopmentSlot(playerId)) break;
    const tile = context.tiles.get(tileKey);
    if (!tile || tile.ownerId !== playerId || !isImprovableResourceTile(tile) || !isAutoImproveResource(tile.resource)) continue;
    if (!improve[tile.resource] || queuedTileKeys.has(tileKey)) continue;
    // A town or dock tile's buildings follow the town rules (support-tile redirects), not this one-tile build.
    if (tile.town || tile.dockId) continue;
    if (context.locksByTile.targetLockAt(tileKey)?.actionType === "ATTACK") continue;
    const structureType = autoImproveStructureForResource(tile.resource);
    const spec = structureType ? STRUCTURE_REGISTRY[structureType] : undefined;
    if (!structureType || !spec || blockedTypes.has(structureType)) continue;
    if (spec.techIds.some((techId) => !actor.techIds.has(techId) || (isAfcModuleTech(techId) && !hasActiveAfcModule(context, summary?.ownedAfcTileKeys, techId)))) {
      blockedTypes.add(structureType);
      continue;
    }
    const goldCost = structureBuildGoldCost(structureType, context.ownedStructureCountForPlayer(playerId, structureType));
    if (actor.points < goldCost) {
      blockedTypes.add(structureType);
      continue;
    }
    const reservation = reservations.estimateBuildReservation(playerId, structureType, tile.x, tile.y, queuedSlotDemand);
    if (!reservation.ok) {
      // Short on manpower or slots holds back every tile of this type; anything else (an AFC or relic
      // footprint) is about this tile only.
      if (reservation.code === "INSUFFICIENT_MANPOWER" || reservation.code === "INSUFFICIENT_SLOT") blockedTypes.add(structureType);
      continue;
    }
    // BUILD_STRUCTURE is the internal normalized build type (see tryDrainDevQueue's identical escape hatch).
    const command = {
      commandId: `auto-improve:${playerId}:${tileKey}:${nowMs}`,
      sessionId: "system-runtime:auto-improve",
      playerId,
      clientSeq: 0,
      issuedAt: nowMs,
      type: "BUILD_STRUCTURE",
      payloadJson: JSON.stringify({ x: tile.x, y: tile.y, structureType })
    } as unknown as CommandEnvelope;
    handleBuildStructureCommand(context, command);
    if (context.tiles.get(tileKey)?.economicStructure?.ownerId === playerId) {
      started += 1;
    } else {
      // Refused for a reason the checks above don't mirror: stop retrying (and re-sending the
      // rejection) every tick. The tile comes back with its next change.
      candidates.delete(tileKey);
    }
  }
  return started;
};
