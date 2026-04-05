import { combatResolutionAlert as combatResolutionAlertFromModule } from "./client-alerts.js";
import {
  firstCaptureGuidanceTarget as firstCaptureGuidanceTargetFromModule,
  inspectionHtmlForTile as inspectionHtmlForTileFromModule,
  passiveTileGuidanceHtml as passiveTileGuidanceHtmlFromModule,
  tileHistoryLines as tileHistoryLinesFromModule
} from "./client-hover-html.js";
import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

type InspectionFlowDeps = {
  state: ClientState;
  prettyToken: (value: string) => string;
  playerNameForOwner: (ownerId?: string | null) => string | undefined;
  terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
  populationPerMinuteLabel: (value: number) => string;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  hostileObservatoryProtectingTile: (tile: Tile) => Tile | undefined;
  pickOriginForTarget: (x: number, y: number, allowAdjacentToDock?: boolean, allowOptimisticExpandOrigin?: boolean) => Tile | undefined;
  keyFor: (x: number, y: number) => string;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  resourceLabel: (resource: string | undefined) => string;
};

export const createClientInspectionFlow = (deps: InspectionFlowDeps) => {
  const {
    state,
    prettyToken,
    playerNameForOwner,
    terrainLabel,
    populationPerMinuteLabel,
    isTileOwnedByAlly,
    hostileObservatoryProtectingTile,
    pickOriginForTarget,
    keyFor,
    terrainAt,
    resourceLabel
  } = deps;

  const tileHistoryLines = (tile: Tile): string[] => tileHistoryLinesFromModule(tile, { me: state.me, playerNameForOwner });

  const firstCaptureGuidanceTarget = (): { tile: Tile; label: string } | undefined =>
    firstCaptureGuidanceTargetFromModule({
      authSessionReady: state.authSessionReady,
      tiles: state.tiles.values(),
      me: state.me,
      homeTile: state.homeTile,
      selected: state.selected,
      camX: state.camX,
      camY: state.camY,
      isTileOwnedByAlly,
      pickOriginForTarget,
      prettyToken
    });

  const displayTownGoldPerMinute = (tile: Tile): number => (tile.town ? tile.town.goldPerMinute : 0);

  const inspectionHtmlForTile = (tile: Tile): string =>
    inspectionHtmlForTileFromModule(tile, {
      playerNameForOwner,
      prettyToken,
      terrainLabel,
      populationPerMinuteLabel,
      hostileObservatoryProtectingTile
    });

  const passiveTileGuidanceHtml = (): string => passiveTileGuidanceHtmlFromModule({ captureGuidance: firstCaptureGuidanceTarget() });

  const growthModifierPercentLabel = (label: "Recently captured" | "Nearby war" | "Long time peace"): string =>
    label === "Long time peace" ? "+100% pop growth" : "-100% pop growth";

  const combatResolutionAlert = (
    msg: Record<string, unknown>,
    context?: { targetTileBefore: Tile | undefined; originTileBefore: Tile | undefined }
  ): { title: string; detail: string; tone: "success" | "warn"; manpowerLoss?: number } =>
    combatResolutionAlertFromModule(msg, context, {
      playerNameForOwner,
      prettyToken,
      resourceLabel,
      terrainLabel,
      terrainAt,
      tiles: state.tiles,
      keyFor
    });

  return {
    tileHistoryLines,
    firstCaptureGuidanceTarget,
    displayTownGoldPerMinute,
    inspectionHtmlForTile,
    passiveTileGuidanceHtml,
    growthModifierPercentLabel,
    combatResolutionAlert
  };
};
