import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { FrontierCommandResult } from "../runtime-frontier-command.js";
import { activeAetherBridgeNeighborKeysForPlayer } from "../runtime-encirclement-application.js";
import { railDepotPositionsFromKeys } from "../runtime/runtime-rail-depot-positions.js";
import type { ActiveAetherBridgeView, LockRecord, RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";
import type { MusterAdvanceCooldowns, MusterTickContext } from "./runtime-muster-tick.js";

export type MusterTickContextDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  activeSiegeOutpostsByOwner: ReadonlyMap<string, Set<string>>;
  activeRelayBeaconsByOwner: ReadonlyMap<string, Set<string>>;
  railDepotTilesByOwner: ReadonlyMap<string, Set<string>>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  advanceCooldowns: MusterAdvanceCooldowns;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  activeAetherBridgesForPlayer: (playerId: string) => ActiveAetherBridgeView[];
  applyManpowerRegen: (player: RuntimePlayer, at?: number) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  requiredMusterForTarget: (target: DomainTileState) => number;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, at: number) => string;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => FrontierCommandResult;
  isStructureDormant: (playerId: string, tileKey: string, field: "siegeOutpost" | "economicStructure") => boolean;
  isInReach: (playerId: string, x: number, y: number) => boolean;
};

/**
 * Builds the MusterTickContext consumed by tickMuster/tickWatchedMusterTiles
 * (runtime-muster-tick.ts). Extracted out of runtime.ts (an already-oversized
 * file — see AGENTS.md's file-line-limit rule) so wiring a new field here
 * doesn't grow that file further.
 */
export const buildMusterTickContext = (deps: MusterTickContextDeps): MusterTickContext => ({
  players: deps.players,
  tiles: deps.tiles,
  activeSiegeOutpostsByOwner: deps.activeSiegeOutpostsByOwner,
  activeRelayBeaconsByOwner: deps.activeRelayBeaconsByOwner,
  railDepotPositionsByOwner: railDepotPositionsFromKeys(deps.railDepotTilesByOwner, deps.tiles, (playerId, tileKey, field) =>
    deps.isStructureDormant(playerId, tileKey, field)
  ),
  applyManpowerRegen: (player: RuntimePlayer, at?: number) => deps.applyManpowerRegen(player, at),
  playerManpowerCap: (player: RuntimePlayer) => deps.playerManpowerCap(player),
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => deps.replaceTileState(tileKey, tile, commandId),
  emitEvent: (event: SimulationEvent) => deps.emitEvent(event),
  tileDeltaFromState: (tile: DomainTileState) => deps.tileDeltaFromState(tile),
  requiredMusterForTarget: (target: DomainTileState) => deps.requiredMusterForTarget(target),
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, at: number) =>
    deps.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => deps.handleFrontierCommand(command, actionType),
  locksByTile: deps.locksByTile,
  advanceCooldowns: deps.advanceCooldowns,
  dockLinksByDockTileKey: deps.dockLinksByDockTileKey,
  aetherBridgeNeighborKeysForPlayer: (playerId: string) =>
    activeAetherBridgeNeighborKeysForPlayer({ activeAetherBridgesForPlayer: deps.activeAetherBridgesForPlayer }, playerId),
  isStructureDormant: (playerId: string, tileKey: string, field: "siegeOutpost" | "economicStructure") =>
    deps.isStructureDormant(playerId, tileKey, field),
  isInReach: (playerId: string, x: number, y: number) => deps.isInReach(playerId, x, y)
});
