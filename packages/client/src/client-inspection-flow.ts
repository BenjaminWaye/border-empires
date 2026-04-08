import { combatResolutionAlert as combatResolutionAlertFromModule } from "./client-alerts.js";
import { tileHistoryLines as tileHistoryLinesFromModule } from "./client-tile-history.js";
import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

type InspectionFlowDeps = {
  state: ClientState;
  prettyToken: (value: string) => string;
  playerNameForOwner: (ownerId?: string | null) => string | undefined;
  terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
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
    keyFor,
    terrainAt,
    resourceLabel
  } = deps;

  const tileHistoryLines = (tile: Tile): string[] => tileHistoryLinesFromModule(tile, { me: state.me, playerNameForOwner });

  const displayTownGoldPerMinute = (tile: Tile): number => (tile.town ? tile.town.goldPerMinute : 0);

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
    displayTownGoldPerMinute,
    growthModifierPercentLabel,
    combatResolutionAlert
  };
};
