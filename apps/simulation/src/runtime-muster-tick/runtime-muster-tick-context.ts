import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { FrontierCommandResult } from "../runtime-frontier-command.js";
import { activeAetherBridgeNeighborKeysForPlayer } from "../runtime-encirclement-application.js";
import { neuralWorksPositionsForPlayer } from "../runtime/runtime-neural-works-positions.js";
import type { ActiveAetherBridgeView, RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";
import type { MusterAdvanceCooldowns, MusterTickContext } from "./runtime-muster-tick.js";
import type { RuntimeState } from "../runtime/runtime-state.js";
import { isTileVisibleToPlayer } from "./muster-visibility.js";

export type MusterTickContextDeps = {
  // Shared world state: players, tiles, combat locks, the dock network and
  // the visibility coverage cache are all read from here.
  state: Pick<RuntimeState, "players" | "tiles" | "locksByTile" | "dockLinksByDockTileKey" | "dockNetworkComponentByTileKey" | "visibilityCoverage">;
  activeSiegeBatteriesByOwner: ReadonlyMap<string, Set<string>>;
  activeRelayBeaconsByOwner: ReadonlyMap<string, Set<string>>;
  neuralWorksTilesByOwner: ReadonlyMap<string, Set<string>>;
  advanceCooldowns: MusterAdvanceCooldowns;
  activeAetherBridgesForPlayer: (playerId: string) => ActiveAetherBridgeView[];
  applyManpowerRegen: (player: RuntimePlayer, at?: number) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (input: { commandId: string; playerId: string }) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  requiredMusterForTarget: (target: DomainTileState, attackerId?: string) => number;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, at: number) => string;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => FrontierCommandResult;
  isStructureDormant: (playerId: string, tileKey: string, field: "siegeBattery" | "economicStructure") => boolean;
  isInReach: (playerId: string, x: number, y: number) => boolean;
};

/**
 * Builds the MusterTickContext consumed by tickMuster/tickWatchedMusterTiles
 * (runtime-muster-tick.ts). Extracted out of runtime.ts (an already-oversized
 * file — see AGENTS.md's file-line-limit rule) so wiring a new field here
 * doesn't grow that file further.
 */
export const buildMusterTickContext = (deps: MusterTickContextDeps): MusterTickContext => ({
  players: deps.state.players,
  tiles: deps.state.tiles,
  activeSiegeBatteriesByOwner: deps.activeSiegeBatteriesByOwner,
  activeRelayBeaconsByOwner: deps.activeRelayBeaconsByOwner,
  neuralWorksPositionsForPlayer: (playerId: string) =>
    neuralWorksPositionsForPlayer(deps.neuralWorksTilesByOwner, playerId, deps.state.tiles, (ownerId, tileKey, field) =>
      deps.isStructureDormant(ownerId, tileKey, field)
    ),
  applyManpowerRegen: (player: RuntimePlayer, at?: number) => deps.applyManpowerRegen(player, at),
  playerManpowerCap: (player: RuntimePlayer) => deps.playerManpowerCap(player),
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => deps.replaceTileState(tileKey, tile, commandId),
  emitEvent: (event: SimulationEvent) => deps.emitEvent(event),
  emitPlayerStateUpdate: (input: { commandId: string; playerId: string }) => deps.emitPlayerStateUpdate(input),
  tileDeltaFromState: (tile: DomainTileState) => deps.tileDeltaFromState(tile),
  requiredMusterForTarget: (target: DomainTileState, attackerId?: string) => deps.requiredMusterForTarget(target, attackerId),
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, at: number) =>
    deps.nextTerritoryAutomationCommandId(label, playerId, tileKey, at),
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => deps.handleFrontierCommand(command, actionType),
  locksByTile: deps.state.locksByTile,
  advanceCooldowns: deps.advanceCooldowns,
  dockLinksByDockTileKey: deps.state.dockLinksByDockTileKey,
  aetherBridgeNeighborKeysForPlayer: (playerId: string) =>
    activeAetherBridgeNeighborKeysForPlayer({ activeAetherBridgesForPlayer: deps.activeAetherBridgesForPlayer }, playerId),
  isStructureDormant: (playerId: string, tileKey: string, field: "siegeBattery" | "economicStructure") =>
    deps.isStructureDormant(playerId, tileKey, field),
  isInReach: (playerId: string, x: number, y: number) => deps.isInReach(playerId, x, y),
  isTileVisibleToPlayer: (playerId: string, x: number, y: number) => isTileVisibleToPlayer(deps.state, playerId, x, y)
});
