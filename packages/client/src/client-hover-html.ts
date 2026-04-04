import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { economicStructureName, resourceLabel, strategicResourceKeyForTile } from "./client-map-display.js";
import type { Tile } from "./client-types.js";

export const tileHistoryLines = (
  tile: Tile,
  deps: { me: string; playerNameForOwner: (ownerId?: string | null) => string | undefined }
): string[] => {
  const history = tile.history;
  if (!history) return [];
  const lines: string[] = [];
  const currentStructureType =
    tile.fort
      ? "FORT"
      : tile.siegeOutpost
        ? "SIEGE_OUTPOST"
        : tile.observatory
          ? "OBSERVATORY"
          : tile.economicStructure?.type;
  const shortOwnerHistoryLabel = (ownerId?: string | null): string => {
    if (!ownerId) return "Unknown";
    if (ownerId === deps.me) return "you";
    if (ownerId === "barbarian") return "Barbarians";
    return deps.playerNameForOwner(ownerId) ?? `Empire ${ownerId.slice(0, 8)}`;
  };
  if (history.captureCount > 0) lines.push(`Captured ${history.captureCount} time${history.captureCount === 1 ? "" : "s"}`);
  if (history.lastOwnerId) lines.push(`Last held by ${shortOwnerHistoryLabel(history.lastOwnerId)}`);
  if (history.wasMountainCreatedByPlayer) lines.push("Artificial mountain");
  if (history.wasMountainRemovedByPlayer) lines.push("Former mountain pass");
  if (history.lastStructureType && history.lastStructureType !== currentStructureType) {
    const label =
      history.lastStructureType === "FORT"
        ? "Former Fort site"
        : history.lastStructureType === "SIEGE_OUTPOST"
          ? "Former Siege Outpost site"
          : history.lastStructureType === "OBSERVATORY"
            ? "Former Observatory site"
            : history.lastStructureType === "FARMSTEAD"
              ? "Former Farmstead site"
              : history.lastStructureType === "CAMP"
                ? "Former Camp site"
                : history.lastStructureType === "MINE"
                  ? "Former Mine site"
                  : history.lastStructureType === "MARKET"
                    ? "Former Market site"
                    : history.lastStructureType === "GRANARY"
                      ? "Former Granary site"
                      : history.lastStructureType === "BANK"
                        ? "Former Bank site"
                        : history.lastStructureType === "AIRPORT"
                          ? "Former Airport site"
                          : history.lastStructureType === "FUR_SYNTHESIZER"
                            ? "Former Fur Synthesizer site"
                            : history.lastStructureType === "ADVANCED_FUR_SYNTHESIZER"
                              ? "Former Advanced Fur Synthesizer site"
                              : history.lastStructureType === "IRONWORKS"
                                ? "Former Ironworks site"
                                : history.lastStructureType === "ADVANCED_IRONWORKS"
                                  ? "Former Advanced Ironworks site"
                                  : history.lastStructureType === "CRYSTAL_SYNTHESIZER"
                                    ? "Former Crystal Synthesizer site"
                                    : history.lastStructureType === "ADVANCED_CRYSTAL_SYNTHESIZER"
                                      ? "Former Advanced Crystal Synthesizer site"
                                      : history.lastStructureType === "FUEL_PLANT"
                                        ? "Former Fuel Plant site"
                                        : history.lastStructureType === "FOUNDRY"
                                          ? "Former Foundry site"
                                          : history.lastStructureType === "GOVERNORS_OFFICE"
                                            ? "Former Governor's Office site"
                                            : "Former Radar System site";
    lines.push(label);
  }
  return lines;
};

const wrappedTileDistance = (x: number, y: number, focus: { x: number; y: number }): number => {
  const dx = Math.min(Math.abs(x - focus.x), WORLD_WIDTH - Math.abs(x - focus.x));
  const dy = Math.min(Math.abs(y - focus.y), WORLD_HEIGHT - Math.abs(y - focus.y));
  return dx + dy;
};

export const firstCaptureGuidanceTarget = (deps: {
  authSessionReady: boolean;
  tiles: Iterable<Tile>;
  me: string;
  homeTile: { x: number; y: number } | undefined;
  selected: { x: number; y: number } | undefined;
  camX: number;
  camY: number;
  isTileOwnedByAlly: (tile: Tile) => boolean;
  pickOriginForTarget: (x: number, y: number, preferBreakthrough: boolean) => unknown;
  prettyToken: (value: string) => string;
}): { tile: Tile; label: string } | undefined => {
  if (!deps.authSessionReady) return undefined;
  let ownedSpecialSiteCount = 0;
  const tiles = [...deps.tiles];
  for (const tile of tiles) {
    if (tile.ownerId !== deps.me) continue;
    if (tile.town || tile.dockId || tile.resource) ownedSpecialSiteCount += 1;
  }
  if (ownedSpecialSiteCount > 0) return undefined;
  const focus = deps.homeTile ?? deps.selected ?? { x: Math.round(deps.camX), y: Math.round(deps.camY) };
  const targets = tiles
    .filter((tile) => !tile.fogged && tile.terrain === "LAND" && tile.ownerId !== deps.me && !deps.isTileOwnedByAlly(tile))
    .filter((tile) => tile.town || tile.dockId || tile.resource)
    .map((tile) => {
      const reachable = Boolean(deps.pickOriginForTarget(tile.x, tile.y, false)) || Boolean(tile.dockId);
      const label = tile.town
        ? "Capture a town"
        : tile.dockId
          ? "Capture a dock"
          : `Capture ${deps.prettyToken(resourceLabel(tile.resource!)).toLowerCase()}`;
      const kindRank = tile.town ? 0 : tile.dockId ? 1 : 2;
      return { tile, label, reachable, kindRank, distance: wrappedTileDistance(tile.x, tile.y, focus) };
    })
    .sort((a, b) => Number(b.reachable) - Number(a.reachable) || a.kindRank - b.kindRank || a.distance - b.distance);
  return targets[0] ? { tile: targets[0].tile, label: targets[0].label } : undefined;
};

export const inspectionHtmlForTile = (
  tile: Tile,
  deps: {
    playerNameForOwner: (ownerId?: string | null) => string | undefined;
    prettyToken: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    populationPerMinuteLabel: (value: number) => string;
    hostileObservatoryProtectingTile: (tile: Tile) => unknown;
  }
): string => {
  const ownerLabel = tile.ownerId ? (deps.playerNameForOwner(tile.ownerId) ?? tile.ownerId.slice(0, 8)) : "neutral";
  const tags = [
    tile.ownershipState ? deps.prettyToken(tile.ownershipState) : "",
    tile.regionType ? deps.prettyToken(tile.regionType) : "",
    tile.clusterType ? deps.prettyToken(tile.clusterType) : "",
    tile.capital ? "Capital" : "",
    tile.dockId ? "Dock" : "",
    tile.fort ? `Fort ${deps.prettyToken(tile.fort.status)}` : "",
    tile.observatory ? `Observatory ${deps.prettyToken(tile.observatory.status)}` : "",
    tile.economicStructure ? `${economicStructureName(tile.economicStructure.type)} ${deps.prettyToken(tile.economicStructure.status)}` : "",
    deps.hostileObservatoryProtectingTile(tile) ? "Protected Field" : "",
    tile.siegeOutpost ? `Siege ${deps.prettyToken(tile.siegeOutpost.status)}` : "",
    tile.sabotage && tile.sabotage.endsAt > Date.now() ? `Sabotaged ${Math.ceil((tile.sabotage.endsAt - Date.now()) / 60000)}m` : "",
    tile.breachShockUntil && tile.breachShockUntil > Date.now() ? "Breach-shocked" : ""
  ].filter(Boolean);
  const townBits: string[] = [];
  if (tile.town) {
    const growthLabel = deps.populationPerMinuteLabel(tile.town.populationGrowthPerMinute ?? 0);
    townBits.push(`${deps.prettyToken(tile.town.type)} town`);
    townBits.push(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);
    townBits.push(
      `Population ${Math.round(tile.town.population).toLocaleString()} (${growthLabel}) (${deps.prettyToken(tile.town.populationTier)})`
    );
    townBits.push(`Connected towns ${tile.town.connectedTownCount} (+${Math.round(tile.town.connectedTownBonus * 100)}%)`);
    if (!tile.town.isFed) townBits.push("Unfed");
    if (tile.town.goldIncomePausedReason === "MANPOWER_NOT_FULL") {
      const current = Math.round(tile.town.manpowerCurrent ?? 0).toLocaleString();
      const cap = Math.round(tile.town.manpowerCap ?? 0).toLocaleString();
      townBits.push(`Gold paused until manpower is full (${current}/${cap})`);
    }
  }
  const terrainAndResource = (() => {
    const terrainText = deps.prettyToken(deps.terrainLabel(tile.x, tile.y, tile.terrain));
    if (!tile.resource) return terrainText;
    return `${terrainText} - ${deps.prettyToken(resourceLabel(tile.resource))}`;
  })();
  const topLine = [`<strong>${tile.x}, ${tile.y}</strong>`, terrainAndResource].filter(Boolean).join(" · ");
  const metaLine = [`Owner ${ownerLabel}`, ...tags].filter(Boolean).join(" · ");
  const extraLine = townBits.length > 0 ? townBits.join(" · ") : "";
  return `
    <div class="hover-line">${topLine}</div>
    <div class="hover-subline">${metaLine}</div>
    ${extraLine ? `<div class="hover-subline">${extraLine}</div>` : ""}
    <div class="hover-subline">Open the tile menu for full overview and actions.</div>
  `;
};

export const passiveTileGuidanceHtml = (deps: {
  captureGuidance: { label: string } | undefined;
}): string => {
  const guidance = deps.captureGuidance
    ? `${deps.captureGuidance.label}. It is marked in green on the map.`
    : "Tap a tile to open its actions and overview.";
  return `
    <div class="hover-line"><strong>Tile details live in the action menu</strong></div>
    <div class="hover-subline">${guidance}</div>
  `;
};
