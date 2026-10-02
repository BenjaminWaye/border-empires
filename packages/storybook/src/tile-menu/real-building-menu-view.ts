import { createClientRuntimeDisplaySupport } from "@client/client-app-runtime-display-support/client-app-runtime-display-support.js";
import { createInitialState, type ClientState } from "@client/client-state/client-state.js";
import { buildDetailTextForAction } from "@client/client-tile-action-detail-text/client-tile-action-detail-text.js";
import { menuActionsForSingleTile, type TileActionLogicDeps } from "@client/client-tile-action-logic/client-tile-action-logic.js";
import { splitTileActionsIntoTabs } from "@client/client-tile-action-support/client-tile-action-support.js";
import type { Tile, TileMenuView } from "@client/client-types.js";

/**
 * Builds a TileMenuView the same way the shipped client does: the real
 * menuActionsForSingleTile (labels, details, costs, disabled reasons) fed
 * through the real splitTileActionsIntoTabs. Only the surrounding game state
 * is faked -- a fully-teched player with plenty of resources -- so the build
 * list isn't hidden by locked techs. Nothing about the building rows is
 * hand-written.
 */
const keyFor = (x: number, y: number): string => `${x},${y}`;

const allTechsUnlocked = (): string[] => Object.assign([] as string[], { includes: () => true });

const richState = (): ClientState => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 100_000;
  state.manpower = 100_000;
  state.techIds = allTechsUnlocked();
  state.resourceSlots = {
    supply: { FOOD: 30, TITANIUM: 30, CRYSTAL: 30, UMBRITE: 30 },
    demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
  };
  return state;
};

export type RealMenuScenario = {
  tile: Tile;
  supportedTowns?: Tile[];
};

export const realBuildingMenuView = (scenario: RealMenuScenario, title: string, subtitle: string): TileMenuView => {
  const state = richState();
  state.tiles.set(keyFor(scenario.tile.x, scenario.tile.y), scenario.tile);
  for (const town of scenario.supportedTowns ?? []) state.tiles.set(keyFor(town.x, town.y), town);
  const display = createClientRuntimeDisplaySupport({ state, formatCooldownShort: (ms) => `${Math.round(ms / 1000)}s`, prettyToken: (v) => v });
  const deps: TileActionLogicDeps = {
    keyFor,
    parseKey: (k) => {
      const [x, y] = k.split(",").map(Number);
      return { x: x ?? 0, y: y ?? 0 };
    },
    wrapX: (x) => x,
    wrapY: (y) => y,
    terrainAt: () => "LAND",
    chebyshevDistanceClient: () => 1,
    isTileOwnedByAlly: () => false,
    hostileObservatoryProtectingTile: () => undefined,
    abilityCooldownRemainingMs: () => 0,
    formatCooldownShort: (ms) => `${Math.round(ms / 1000)}s`,
    pushFeed: () => undefined,
    hideTileActionMenu: () => undefined,
    selectedTile: () => scenario.tile,
    renderHud: () => undefined,
    requireAuthedSession: () => true,
    ws: { readyState: 1, send: () => undefined } as unknown as TileActionLogicDeps["ws"],
    attackPreviewDetailForTarget: () => undefined,
    attackPreviewPendingForTarget: () => false,
    attackPreviewManpowerCostForTarget: () => undefined,
    pickOriginForTarget: () => scenario.tile,
    buildDetailTextForAction,
    developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }),
    developmentSlotReason: () => "No free development slot",
    structureGoldCost: display.structureGoldCost,
    structureCostText: display.structureCostText,
    supportedOwnedTownsForTile: () => scenario.supportedTowns ?? [],
    supportedOwnedDocksForTile: () => [],
    townHasSupportStructure: () => false,
    activeTruceWithPlayer: () => undefined,
    pendingTruceWithPlayer: () => undefined,
    ownerSpawnShieldActive: () => false,
    connectedOwnedFrontierKeysFor: () => []
  };
  const tabs = splitTileActionsIntoTabs(menuActionsForSingleTile(state, scenario.tile, deps), state);
  return {
    title,
    subtitle,
    tabs: ["overview", "actions", "buildings"],
    overviewLines: [],
    ...tabs
  };
};
