import {
  beginCrystalTargeting as beginCrystalTargetingFromModule,
  clearCrystalTargeting as clearCrystalTargetingFromModule,
  computeCrystalTargets as computeCrystalTargetsFromModule,
  crystalTargetingTitle as crystalTargetingTitleFromModule,
  crystalTargetingTone as crystalTargetingToneFromModule,
  executeCrystalTargeting as executeCrystalTargetingFromModule,
  hasAetherBridgeCapability as hasAetherBridgeCapabilityFromModule,
  hasBreakthroughCapability as hasBreakthroughCapabilityFromModule,
  hasOwnedLandWithinClientRange as hasOwnedLandWithinClientRangeFromModule,
  hasRevealCapability as hasRevealCapabilityFromModule,
  hasSiphonCapability as hasSiphonCapabilityFromModule,
  hasTerrainShapingCapability as hasTerrainShapingCapabilityFromModule,
  isOwnedBorderTile as isOwnedBorderTileFromModule,
  lineStepsBetween as lineStepsBetweenFromModule,
  menuActionsForSingleTile as menuActionsForSingleTileFromModule,
  tileActionAvailability as tileActionAvailabilityFromModule,
  tileActionAvailabilityWithDevelopmentSlot as tileActionAvailabilityWithDevelopmentSlotFromModule
} from "./client-tile-action-logic.js";
import {
  chebyshevDistanceClient as chebyshevDistanceClientFromModule,
  hideTechLockedTileAction as hideTechLockedTileActionFromModule,
  hostileObservatoryProtectingTile as hostileObservatoryProtectingTileFromModule,
  isTileOwnedByAlly as isTileOwnedByAllyFromModule,
  requiredTechForTileAction as requiredTechForTileActionFromModule,
  splitTileActionsIntoTabs as splitTileActionsIntoTabsFromModule,
  tileActionIsBuilding as tileActionIsBuildingFromModule,
  tileActionIsCrystal as tileActionIsCrystalFromModule
} from "./client-tile-action-support.js";
import {
  openBulkTileActionMenu as openBulkTileActionMenuFromModule,
  openSingleTileActionMenu as openSingleTileActionMenuFromModule,
  renderTileActionMenu as renderTileActionMenuFromModule
} from "./client-tile-action-menu-ui.js";
import type { ClientState } from "./client-state.js";
import type { CrystalTargetingAbility, Tile, TileActionDef, TileMenuView } from "./client-types.js";

type ActionFlowTargetingContext = Record<string, any> & {
  state: ClientState;
};

export const createClientActionFlowTargeting = (ctx: ActionFlowTargetingContext) => {
  const { state } = ctx;

  const tileActionIsCrystal = (id: TileActionDef["id"]): boolean => tileActionIsCrystalFromModule(id);
  const tileActionIsBuilding = (id: TileActionDef["id"]): boolean => tileActionIsBuildingFromModule(id);
  const requiredTechForTileAction = (actionId: TileActionDef["id"]): string | undefined => requiredTechForTileActionFromModule(actionId);
  const hideTechLockedTileAction = (action: TileActionDef): boolean => hideTechLockedTileActionFromModule(action, state);
  const splitTileActionsIntoTabs = (actions: TileActionDef[]): Pick<TileMenuView, "actions" | "buildings" | "crystal"> => splitTileActionsIntoTabsFromModule(actions, state);
  const isTileOwnedByAlly = (tile: Tile): boolean => isTileOwnedByAllyFromModule(tile, state);
  const chebyshevDistanceClient = (ax: number, ay: number, bx: number, by: number): number => chebyshevDistanceClientFromModule(ax, ay, bx, by);
  const hostileObservatoryProtectingTile = (tile: Tile): Tile | undefined => hostileObservatoryProtectingTileFromModule(state, tile);
  const abilityCooldownRemainingMs = (abilityId: "aether_bridge" | "siphon" | "reveal_empire" | "create_mountain" | "remove_mountain"): number => Math.max(0, (state.abilityCooldowns[abilityId] ?? 0) - Date.now());
  const formatCooldownShort = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };
  const formatCountdownClock = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };
  const tileActionLogicDeps = () => ({
    keyFor: ctx.keyFor,
    parseKey: ctx.parseKey,
    wrapX: ctx.wrapX,
    wrapY: ctx.wrapY,
    terrainAt: ctx.terrainAt,
    chebyshevDistanceClient,
    isTileOwnedByAlly,
    hostileObservatoryProtectingTile,
    abilityCooldownRemainingMs,
    formatCooldownShort,
    pushFeed: ctx.pushFeed,
    hideTileActionMenu: ctx.hideTileActionMenu,
    hideHoldBuildMenu: ctx.hideHoldBuildMenu,
    selectedTile: ctx.selectedTile,
    renderHud: ctx.renderHud,
    requireAuthedSession: ctx.requireAuthedSession,
    ws: ctx.ws,
    attackPreviewDetailForTarget: ctx.attackPreviewDetailForTarget,
    pickOriginForTarget: ctx.pickOriginForTarget,
    buildDetailTextForAction: ctx.buildDetailTextForAction,
    developmentSlotSummary: ctx.developmentSlotSummary,
    developmentSlotReason: ctx.developmentSlotReason,
    structureGoldCost: ctx.structureGoldCost,
    structureCostText: ctx.structureCostText,
    supportedOwnedTownsForTile: ctx.supportedOwnedTownsForTile,
    supportedOwnedDocksForTile: ctx.supportedOwnedDocksForTile,
    townHasSupportStructure: ctx.townHasSupportStructure,
    activeTruceWithPlayer: ctx.activeTruceWithPlayer,
    ownerSpawnShieldActive: ctx.ownerSpawnShieldActive
  });
  const hasRevealCapability = (): boolean => hasRevealCapabilityFromModule(state);
  const hasBreakthroughCapability = (): boolean => hasBreakthroughCapabilityFromModule(state);
  const hasAetherBridgeCapability = (): boolean => hasAetherBridgeCapabilityFromModule(state);
  const hasSiphonCapability = (): boolean => hasSiphonCapabilityFromModule(state);
  const hasTerrainShapingCapability = (): boolean => hasTerrainShapingCapabilityFromModule(state);
  const hasOwnedLandWithinClientRange = (x: number, y: number, range: number): boolean => hasOwnedLandWithinClientRangeFromModule(state, x, y, range, tileActionLogicDeps());
  const crystalTargetingTitle = (ability: CrystalTargetingAbility): string => crystalTargetingTitleFromModule(ability);
  const crystalTargetingTone = (ability: CrystalTargetingAbility): "amber" | "cyan" | "red" => crystalTargetingToneFromModule(ability);
  const clearCrystalTargeting = (): void => clearCrystalTargetingFromModule(state);
  const lineStepsBetween = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => lineStepsBetweenFromModule(ax, ay, bx, by, tileActionLogicDeps());
  const computeCrystalTargets = (ability: CrystalTargetingAbility): { validTargets: Set<string>; originByTarget: Map<string, string> } => computeCrystalTargetsFromModule(state, ability, tileActionLogicDeps());
  const beginCrystalTargeting = (ability: CrystalTargetingAbility): void => beginCrystalTargetingFromModule(state, ability, tileActionLogicDeps());
  const executeCrystalTargeting = (tile: Tile): boolean => executeCrystalTargetingFromModule(state, tile, tileActionLogicDeps());
  const tileActionAvailability = (enabled: boolean, reason: string, cost?: string): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => tileActionAvailabilityFromModule(enabled, reason, cost);
  const tileActionAvailabilityWithDevelopmentSlot = (enabledWithoutSlot: boolean, baseReason: string, cost?: string, summary = ctx.developmentSlotSummary()): Pick<TileActionDef, "disabled" | "disabledReason" | "cost"> => tileActionAvailabilityWithDevelopmentSlotFromModule(enabledWithoutSlot, baseReason, cost, summary, tileActionLogicDeps());
  const isOwnedBorderTile = (x: number, y: number): boolean => isOwnedBorderTileFromModule(state, x, y, tileActionLogicDeps());
  const menuActionsForSingleTile = (tile: Tile): TileActionDef[] => menuActionsForSingleTileFromModule(state, tile, tileActionLogicDeps());
  const tileActionMenuUiDeps = () => ({
    tileActionMenuEl: ctx.tileActionMenuEl,
    viewportSize: ctx.viewportSize,
    isMobile: ctx.isMobile,
    hideTileActionMenu: ctx.hideTileActionMenu,
    tileMenuViewForTile: ctx.tileMenuViewForTile,
    handleTileAction: ctx.handleTileAction,
    cancelQueuedSettlement: ctx.cancelQueuedSettlement,
    cancelQueuedBuild: ctx.cancelQueuedBuild,
    sendGameMessage: ctx.sendGameMessage,
    applyOptimisticStructureCancel: ctx.applyOptimisticStructureCancel,
    renderHud: ctx.renderHud,
    requestAttackPreviewForTarget: ctx.requestAttackPreviewForTarget,
    keyFor: ctx.keyFor,
    hasBreakthroughCapability,
    isTileOwnedByAlly
  });
  const renderTileActionMenu = (view: TileMenuView, clientX: number, clientY: number): void => renderTileActionMenuFromModule(state, view, clientX, clientY, tileActionMenuUiDeps());
  const openSingleTileActionMenu = (tile: Tile, clientX: number, clientY: number): void => openSingleTileActionMenuFromModule(state, tile, clientX, clientY, tileActionMenuUiDeps());
  const openBulkTileActionMenu = (targetKeys: string[], clientX: number, clientY: number): void => openBulkTileActionMenuFromModule(state, targetKeys, clientX, clientY, tileActionMenuUiDeps());

  return {
    tileActionIsCrystal,
    tileActionIsBuilding,
    requiredTechForTileAction,
    hideTechLockedTileAction,
    splitTileActionsIntoTabs,
    isTileOwnedByAlly,
    chebyshevDistanceClient,
    hostileObservatoryProtectingTile,
    abilityCooldownRemainingMs,
    formatCooldownShort,
    formatCountdownClock,
    tileActionLogicDeps,
    hasRevealCapability,
    hasBreakthroughCapability,
    hasAetherBridgeCapability,
    hasSiphonCapability,
    hasTerrainShapingCapability,
    hasOwnedLandWithinClientRange,
    crystalTargetingTitle,
    crystalTargetingTone,
    clearCrystalTargeting,
    lineStepsBetween,
    computeCrystalTargets,
    beginCrystalTargeting,
    executeCrystalTargeting,
    tileActionAvailability,
    tileActionAvailabilityWithDevelopmentSlot,
    isOwnedBorderTile,
    menuActionsForSingleTile,
    tileActionMenuUiDeps,
    renderTileActionMenu,
    openSingleTileActionMenu,
    openBulkTileActionMenu
  };
};
