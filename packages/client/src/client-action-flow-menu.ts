import { tileAreaEffectModifiersForTile as tileAreaEffectModifiersForTileFromModule } from "./client-structure-effects.js";
import {
  buildDetailTextForAction as buildDetailTextForActionFromModule,
  constructionProgressForTile as constructionProgressForTileFromModule,
  menuOverviewForTile as menuOverviewForTileFromModule,
  queuedBuildProgressForTile as queuedBuildProgressForTileFromModule,
  queuedSettlementProgressForTile as queuedSettlementProgressForTileFromModule,
  tileMenuViewForTile as tileMenuViewForTileFromModule,
  tileProductionRequirementLabel as tileProductionRequirementLabelFromModule
} from "./client-tile-menu-view.js";
import type { ClientState } from "./client-state.js";
import type { Tile, TileMenuProgressView, TileMenuView, TileOverviewLine } from "./client-types.js";

type ActionFlowMenuContext = Record<string, any> & {
  state: ClientState;
};

export const createClientActionFlowMenu = (ctx: ActionFlowMenuContext) => {
  const { state } = ctx;

  const constructionCountdownLineForTile = (tile: Tile): string => {
    if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") return `Fortifying... ${ctx.formatCountdownClock(tile.fort.completesAt - Date.now())}`;
    if (tile.fort?.status === "removing" && typeof tile.fort.completesAt === "number") return `Removing Fort... ${ctx.formatCountdownClock(tile.fort.completesAt - Date.now())}`;
    if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") return `Building Observatory... ${ctx.formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
    if (tile.observatory?.status === "removing" && typeof tile.observatory.completesAt === "number") return `Removing Observatory... ${ctx.formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
    if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") return `Building Siege Camp... ${ctx.formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
    if (tile.siegeOutpost?.status === "removing" && typeof tile.siegeOutpost.completesAt === "number") return `Removing Siege Outpost... ${ctx.formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
    if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") return `Building ${ctx.economicStructureName(tile.economicStructure.type)}... ${ctx.formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
    if (tile.economicStructure?.status === "removing" && typeof tile.economicStructure.completesAt === "number") return `Removing ${ctx.economicStructureName(tile.economicStructure.type)}... ${ctx.formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
    return "";
  };

  const constructionRemainingMsForTile = (tile: Tile): number | undefined => {
    const completesAt =
      tile.fort?.status === "under_construction" || tile.fort?.status === "removing"
        ? tile.fort.completesAt
        : tile.observatory?.status === "under_construction" || tile.observatory?.status === "removing"
          ? tile.observatory.completesAt
          : tile.siegeOutpost?.status === "under_construction" || tile.siegeOutpost?.status === "removing"
            ? tile.siegeOutpost.completesAt
            : tile.economicStructure?.status === "under_construction" || tile.economicStructure?.status === "removing"
              ? tile.economicStructure.completesAt
              : undefined;
    return typeof completesAt === "number" ? Math.max(0, completesAt - Date.now()) : undefined;
  };

  const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined =>
    buildDetailTextForActionFromModule(actionId, tile, supportedTown);

  const tileProductionRequirementLabel = (tile: Tile): string | undefined => tileProductionRequirementLabelFromModule(tile, ctx.prettyToken);

  const constructionProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    constructionProgressForTileFromModule(tile, ctx.formatCountdownClock);

  const queuedSettlementProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedSettlementProgressForTileFromModule(tile, {
      keyFor: ctx.keyFor,
      queuedDevelopmentEntryForTile: ctx.queuedDevelopmentEntryForTile,
      queuedSettlementIndexForTile: ctx.queuedSettlementIndexForTile
    });

  const queuedBuildProgressForTile = (tile: Tile): TileMenuProgressView | undefined =>
    queuedBuildProgressForTileFromModule(tile, {
      keyFor: ctx.keyFor,
      queuedDevelopmentEntryForTile: ctx.queuedDevelopmentEntryForTile
    });

  const menuOverviewForTile = (tile: Tile): TileOverviewLine[] =>
    menuOverviewForTileFromModule(tile, {
      state,
      prettyToken: ctx.prettyToken,
      terrainLabel: ctx.terrainLabel,
      displayTownGoldPerMinute: ctx.displayTownGoldPerMinute,
      populationPerMinuteLabel: ctx.populationPerMinuteLabel,
      townNextGrowthEtaLabel: ctx.townNextGrowthEtaLabel,
      supportedOwnedTownsForTile: ctx.supportedOwnedTownsForTile,
      connectedDockCountForTile: (dockTile: Tile) =>
        dockTile.dockId
          ? state.dockPairs.filter((pair: Record<string, number>) => (pair.ax === dockTile.x && pair.ay === dockTile.y) || (pair.bx === dockTile.x && pair.by === dockTile.y)).length
          : 0,
      hostileObservatoryProtectingTile: ctx.hostileObservatoryProtectingTile,
      constructionCountdownLineForTile,
      tileHistoryLines: ctx.tileHistoryLines,
      isTileOwnedByAlly: ctx.isTileOwnedByAlly,
      areaEffectModifiersForTile: (targetTile: Tile) => tileAreaEffectModifiersForTileFromModule(targetTile, state.tiles.values())
    });

  const tileMenuViewForTile = (tile: Tile): TileMenuView =>
    tileMenuViewForTileFromModule(tile, {
      menuActionsForSingleTile: ctx.menuActionsForSingleTile,
      splitTileActionsIntoTabs: ctx.splitTileActionsIntoTabs,
      settlementProgressForTile: (x: number, y: number) => {
        const progress = ctx.settlementProgressForTile(x, y);
        if (!progress) return undefined;
        return {
          title: "Settlement in progress",
          detail: progress.awaitingServerConfirm
            ? "Settlement timer finished locally. Waiting for server confirmation."
            : "Settling unlocks defense and activates town and resource production.",
          remainingLabel: progress.awaitingServerConfirm ? "Syncing..." : ctx.formatCountdownClock(Math.max(0, progress.resolvesAt - Date.now())),
          progress: progress.awaitingServerConfirm ? 1 : Math.max(0, Math.min(1, (Date.now() - progress.startAt) / Math.max(1, progress.resolvesAt - progress.startAt))),
          note: progress.awaitingServerConfirm ? "Keeping the tile settled client-side until the server responds." : "This tile is actively settling."
        };
      },
      queuedSettlementProgressForTile,
      queuedBuildProgressForTile,
      constructionProgressForTile,
      menuOverviewForTile,
      prettyToken: ctx.prettyToken,
      terrainLabel: ctx.terrainLabel,
      isTileOwnedByAlly: ctx.isTileOwnedByAlly,
      state
    });

  return {
    constructionCountdownLineForTile,
    constructionRemainingMsForTile,
    buildDetailTextForAction,
    tileProductionRequirementLabel,
    constructionProgressForTile,
    queuedSettlementProgressForTile,
    queuedBuildProgressForTile,
    menuOverviewForTile,
    tileMenuViewForTile
  };
};
