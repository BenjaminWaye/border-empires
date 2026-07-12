import {
  FORT_BUILD_MS,
  FORT_TIER_LADDER,
  MUSTER_ATTACK_COST,
  MUSTER_SYSTEM_ENABLED,
  OBSERVATORY_VISION_BONUS,
  OBSERVATORY_BUILD_MS,
  SIEGE_OUTPOST_BUILD_MS,
  SIEGE_TIER_LADDER,
  nextFortTierForUpgrade,
  structureBuildDurationMs
} from "@border-empires/shared";
import { economicStructureBuildMs, economicStructureName, resourceLabel, strategicResourceKeyForTile, tileProductionHtml } from "../client-map-display.js";
import { tileOverviewModifiersForTile } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import { tileMenuOverviewIntroLines, tileMenuSubtitleText } from "../client-tile-menu-copy/client-tile-menu-copy.js";
import { captureRecoveryRemainingMsForTile, isFrontierNaturallyDecaying, tileMenuHeaderStatusForTile } from "../client-tile-menu-status/client-tile-menu-status.js";
import { tileOverviewUpkeepLines } from "../client-tile-upkeep-view.js";
import type { TileAreaEffectModifier } from "../client-structure-effects/client-structure-effects.js";
import type { OptimisticStructureKind, Tile, TileActionDef, TileMenuProgressView, TileMenuTab, TileMenuView, TileOverviewLine } from "../client-types.js";
const isSynthLikeStructureType = (type: NonNullable<Tile["economicStructure"]>["type"]): boolean =>
  ["FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER", "IRONWORKS", "ADVANCED_IRONWORKS", "CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"].includes(type);

const supportContributionLine = (tile: Tile, town: Tile): string | undefined => { const type = tile.economicStructure?.status === "active" ? tile.economicStructure.type : undefined; const townName = town.town?.name ?? `town at (${town.x}, ${town.y})`; return type === "MARKET" ? `Market contributes to ${townName}: +50% town gold production; higher production raises gold cap.` : type === "BANK" ? `Bank contributes to ${townName}: +50% city income and +1 gold/m.` : type === "GRANARY" ? `${economicStructureName(type)} contributes to ${townName}: population growth bonus.` : type === "CLEARING_HOUSE" ? `Clearing House contributes to ${townName} and directly connected towns: +25% Market effect, +20% Bank effect, +0.5 Bank gold/m.` : undefined; };

const structureNameForTile = (tile: Tile): string | undefined => {
  if (tile.fort) return tile.fort.variant === "THUNDER_BASTION" ? "Thunder Bastion" : tile.fort.variant === "IRON_BASTION" ? "Iron Bastion" : "Fort";
  if (tile.observatory) return "Observatory";
  if (tile.siegeOutpost) return tile.siegeOutpost.variant === "DREAD_TOWER" ? "Dread Tower" : tile.siegeOutpost.variant === "SIEGE_TOWER" ? "Siege Tower" : "Siege Outpost";
  if (tile.economicStructure) return economicStructureName(tile.economicStructure.type);
  return undefined;
};

export const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined => {
  const supportedTownLabel = supportedTown?.town?.name ? supportedTown.town.name : supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
  if (actionId === "settle_land") return "Makes this tile defended and activates production.";
  if (actionId === "settle_connected_frontier") return "Queues a settlement on every connected frontier tile you own.";
  if (actionId === "build_fortification") {
    // Only show upgrade text when a fort already exists on the tile.
    // Without this guard, a tile.fort === undefined falls through the
    // ?? "FORT" default and shows "Upgrade this Fort" for fresh builds.
    if (tile.fort) {
      const currentVariant = tile.fort.variant ?? "FORT";
      if (currentVariant === "FORT") return `Upgrade this Fort into an Iron Bastion. Iron Bastions defend at ${FORT_TIER_LADDER.IRON_BASTION.defenseMult}x.`;
      if (currentVariant === "IRON_BASTION") return `Upgrade this Iron Bastion into a Thunder Bastion. Thunder Bastions defend at ${FORT_TIER_LADDER.THUNDER_BASTION.defenseMult}x.`;
      // THUNDER_BASTION shouldn't expose this action at all; fall through for safety.
    }
    return tile.economicStructure?.type === "WOODEN_FORT"
      ? `Upgrade this Wooden Fort into a full fortification. Forts defend at ${FORT_TIER_LADDER.FORT.defenseMult}x and stop failed attacks from costing the origin tile.`
      : `Fortify this tile. Forts defend at ${FORT_TIER_LADDER.FORT.defenseMult}x and stop failed attacks from costing the origin tile.`;
  }
  if (actionId === "build_wooden_fort") return "Build a lighter fortification on this border or dock tile. Weaker than a full fort, but gold-only.";
  if (actionId === "build_observatory") return `Extends local vision by ${OBSERVATORY_VISION_BONUS} and blocks hostile crystal actions nearby.`;
  if (actionId === "build_siege_camp") {
    // Only show upgrade text when a siege outpost already exists.
    if (tile.siegeOutpost) {
      const currentVariant = tile.siegeOutpost.variant ?? "SIEGE_OUTPOST";
      if (currentVariant === "SIEGE_OUTPOST") return `Upgrade this Siege Outpost into a Siege Tower. Siege Towers attack at ${SIEGE_TIER_LADDER.SIEGE_TOWER.attackMult}x.`;
      if (currentVariant === "SIEGE_TOWER") return `Upgrade this Siege Tower into a Dread Tower. Dread Towers attack at ${SIEGE_TIER_LADDER.DREAD_TOWER.attackMult}x.`;
      // DREAD_TOWER shouldn't expose this action; fall through for safety.
    }
    return tile.economicStructure?.type === "LIGHT_OUTPOST"
      ? `Upgrade this Light Outpost into a full siege outpost. Siege Outposts attack at ${SIEGE_TIER_LADDER.SIEGE_OUTPOST.attackMult}x.`
      : `Adds an offensive staging point on this border or dock tile. Siege Outposts attack at ${SIEGE_TIER_LADDER.SIEGE_OUTPOST.attackMult}x.`;
  }
  if (actionId === "build_light_outpost") return "Build a light outpost on this border or dock tile. It comes online fast, costs only gold, and grants a smaller attack bonus.";
  if (actionId === "build_farmstead") return tile.resource === "FARM" ? "Improves food production on this tile by 50% and adds +18 food cap." : "Farmsteads do not boost fish output.";
  if (actionId === "build_camp") return "Improves supply production on this tile by 50% and adds +15 supply cap.";
  if (actionId === "build_mine") return `Improves ${tile.resource === "IRON" ? "iron" : "crystal"} production on this tile by 50% and adds +${tile.resource === "IRON" ? "15 iron" : "9 crystal"} cap.`;
  if (actionId === "build_market") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +50% town gold production and +${Math.round((supportedTown?.town?.goldPerMinute ?? 0) * 360).toLocaleString()} gold cap.`;
  }
  if (actionId === "build_granary") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +15% population growth.`;
  }
  if (actionId === "build_bank") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +50% city income and +1 flat income.`;
  }
  if (actionId === "build_airport") return "Build a Sky Dock on empty settled land. Bombard enemy tiles within 30 tiles for crystal.";
  if (actionId === "build_aether_tower") return "Late-game power node. Sky and monument structures in its radius stay online.";
  if (actionId === "build_caravanary") {
    return `Build on this support tile for ${supportedTownLabel}. Boosts its connected-town income bonus by 25%.`;
  }
  if (actionId === "build_fur_synthesizer") return "Convert heavy gold upkeep into steady supply output on this support tile with a Fur Synthesizer.";
  if (actionId === "upgrade_fur_synthesizer") return "Upgrade this Fur Synthesizer into an Advanced Fur Synthesizer with 20% higher output.";
  if (actionId === "build_ironworks") return "Convert heavy gold upkeep into steady iron output on this support tile.";
  if (actionId === "upgrade_ironworks") return "Upgrade this Ironworks into an Advanced Ironworks with 20% higher output.";
  if (actionId === "build_crystal_synthesizer") return "Convert heavy gold upkeep into steady crystal output on this support tile with an Aether Condenser.";
  if (actionId === "upgrade_crystal_synthesizer") return "Upgrade this Aether Condenser into an Advanced Aether Condenser with 20% higher output.";
  if (actionId === "overload_fur_synthesizer") return "Spend 12500 gold for an instant supply burst, then shut this Fur Synthesizer down for 24 hours.";
  if (actionId === "overload_ironworks") return "Spend 12500 gold for an instant iron burst, then shut this ironworks down for 24 hours.";
  if (actionId === "overload_crystal_synthesizer") return "Spend 12500 gold for an instant crystal burst, then shut this synthesizer down for 24 hours.";
  if (actionId === "enable_converter_structure") return "Resume this converter. It immediately pays the next upkeep tick, then starts producing again.";
  if (actionId === "disable_converter_structure") return "Pause this converter. It stops paying upkeep and stops producing until you enable it again.";
  if (actionId === "build_foundry") return "Industrial hub. Doubles active mine production within 5 tiles; boosted production raises iron and crystal caps.";
  if (actionId === "build_garrison_hall") return "Defensive command center. Boosts settled-tile defense by 20% within 10 tiles.";
  if (actionId === "build_customs_house") return "Build on a settled dock tile. Adds +1 gold / minute per connected owned dock.";
  if (actionId === "build_lockworks_port") return "Upgrade a Harbor Exchange into a Lockworks Port with stronger dock-route income and storage.";
  if (actionId === "build_rail_depot") return "Build on a town support tile. Mustering hub: boosts manpower regen and speeds up outpost muster within 50 tiles. Also settles the nearest owned frontier tile within 20 tiles every 10 minutes and adds +10 connected-town income points across the linked town network.";
  if (actionId === "build_exchange_house") return "Build on a great commercial city's support tile. It scales gold and growth with the local support network.";
  if (actionId === "build_imperial_exchange_part") return "Build one of three Imperial Exchange monument parts in a Great City or Monumental City.";
  if (actionId === "build_world_engine_part") return "Build one of three Worldbreaker Cannon monument parts in a Great City or Monumental City.";
  if (actionId === "build_aegis_dome_part") return "Build one of three Aegis Dome monument parts in a Great City or Monumental City.";
  if (actionId === "build_astral_dock_part") return "Build one of three Astral Dock monument parts in a Great City or Monumental City.";
  if (actionId === "build_imperial_exchange") return "Place the final Imperial Exchange for free after finishing three parts.";
  if (actionId === "build_world_engine") return "Place the final Worldbreaker Cannon for free after finishing three parts.";
  if (actionId === "build_aegis_dome") return "Place the final Aegis Dome for free after finishing three parts.";
  if (actionId === "build_astral_dock") return "Place the final Astral Dock for free after finishing three parts.";
  if (actionId === "imperial_exchange_levy_food") return "Seize every rival empire's stored FOOD at once.";
  if (actionId === "imperial_exchange_levy_iron") return "Seize every rival empire's stored IRON at once.";
  if (actionId === "imperial_exchange_levy_crystal") return "Seize every rival empire's stored CRYSTAL at once.";
  if (actionId === "imperial_exchange_levy_supply") return "Seize every rival empire's stored SUPPLY at once.";
  if (actionId === "world_engine_strike") return "Arm the Worldbreaker Cannon and choose an enemy land tile to shatter into mountain.";
  if (actionId === "airport_bombard") return "Arm the Sky Dock and choose an enemy land tile within 30 tiles to bombard.";
  if (actionId === "retort_recast_food") return "Recast this exposed resource tile into a food vein.";
  if (actionId === "retort_recast_supply") return "Recast this exposed resource tile into a supply vein.";
  if (actionId === "retort_recast_iron") return "Recast this exposed resource tile into an iron vein.";
  if (actionId === "retort_recast_crystal") return "Recast this exposed resource tile into a crystal vein.";
  if (actionId === "aether_emp") return "Fire an Aether EMP to disable one hostile powered structure for 20 minutes.";
  if (actionId === "city_overclock") return "Overclock this city for 15 minutes to boost local growth, income, and manpower output.";
  if (actionId === "astral_dock_launch") return "Launch one satellite for 24 hours of full-map vision.";
  if (actionId === "aegis_lock") return "Seal the Aegis Dome region so hostile attacks cannot change ownership and hostile abilities fail for a short time.";
  if (actionId === "build_governors_office") return "Administrative center. Builds a Ministry Hall that reduces local food upkeep and settled-tile upkeep within 10 tiles.";
  if (actionId === "build_radar_system") return "Resonance grid. Blocks enemy sky bombardment within 30 tiles and reveals the attack origin.";
  if (actionId === "remove_structure") {
    const structureName = structureNameForTile(tile);
    if (!structureName) return undefined;
    if (tile.economicStructure) {
      return `Remove this ${structureName}. Its income, upkeep, and structure effects stay disabled until removal finishes.`;
    }
    if (tile.fort) return `Remove this ${structureNameForTile(tile)}. Its defense bonus is disabled until removal finishes.`;
    if (tile.observatory) return "Remove this Observatory. Its vision and protection effects are disabled until removal finishes.";
    if (tile.siegeOutpost) return `Remove this ${structureNameForTile(tile)}. Its attack bonus is disabled until removal finishes.`;
  }
  return undefined;
};

export const tileProductionRequirementLabel = (tile: Tile, prettyToken: (value: string) => string): string | undefined => {
  if (tile.town) return "gold";
  const strategicKey = strategicResourceKeyForTile(tile);
  if (strategicKey) return prettyToken(strategicKey).toLowerCase();
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  if (gpm > 0.01) return "gold";
  return undefined;
};

export const constructionProgressForTile = (
  tile: Tile,
  formatCountdownClock: (ms: number) => string
): TileMenuProgressView | undefined => {
  const nowMs = Date.now();
  if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Fortification under construction",
      detail: "This tile will gain fortified defense when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, FORT_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  if (tile.fort?.status === "removing" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Removing Fort",
      detail: "This fortification is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("FORT")))),
      note: "Defense from this fort is disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Observatory under construction",
      detail: "This tile will extend vision and observatory protection when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, OBSERVATORY_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  if (tile.observatory?.status === "removing" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Removing Observatory",
      detail: "This observatory is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("OBSERVATORY")))),
      note: "Vision, observatory protection, and crystal-casting effects are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Siege camp under construction",
      detail: "This tile will gain an offensive staging structure when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, SIEGE_OUTPOST_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  if (tile.siegeOutpost?.status === "removing" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Removing Siege Outpost",
      detail: "This outpost is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("SIEGE_OUTPOST")))),
      note: "Attack bonuses from this outpost are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    return {
      title: `${economicStructureName(tile.economicStructure.type)} under construction`,
      detail: "This tile is still being developed and is not fully online yet.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, economicStructureBuildMs(tile.economicStructure.type)))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction"
    };
  }
  if (tile.economicStructure?.status === "removing" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    return {
      title: `Removing ${economicStructureName(tile.economicStructure.type)}`,
      detail: "This building is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, economicStructureBuildMs(tile.economicStructure.type)))),
      note: "Income, upkeep, and structure effects are paused while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  return undefined;
};

export const queuedSettlementProgressForTile = (
  tile: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    queuedDevelopmentEntryForTile: (tileKey: string) => { kind: string; tileKey: string; label?: string; optimisticKind?: string } | undefined;
    queuedSettlementIndexForTile: (tileKey: string) => number;
  }
): TileMenuProgressView | undefined => {
  const entry = deps.queuedDevelopmentEntryForTile(deps.keyFor(tile.x, tile.y));
  if (!entry || entry.kind !== "SETTLE") return undefined;
  const queueIndex = deps.queuedSettlementIndexForTile(entry.tileKey);
  return {
    title: "Settlement queued",
    detail: "This frontier tile is queued to settle as soon as a development slot becomes free.",
    remainingLabel: queueIndex >= 0 ? `Queue #${queueIndex + 1}` : "Queued",
    progress: 0,
    note: "Queued settlements reserve their place in line and can be cancelled before they start.",
    cancelLabel: "Cancel queued settlement",
    cancelActionId: "cancel_queued_settlement"
  };
};

export const queuedBuildProgressForTile = (
  tile: Tile,
  deps: {
    keyFor: (x: number, y: number) => string;
    queuedDevelopmentEntryForTile: (tileKey: string) => { kind: string; tileKey: string; label?: string } | undefined;
  }
): TileMenuProgressView | undefined => {
  const entry = deps.queuedDevelopmentEntryForTile(deps.keyFor(tile.x, tile.y));
  if (!entry || entry.kind !== "BUILD") return undefined;
  const baseTitle = entry.label?.replace(/\sat\s+\(.+\)$/, "") ?? "Build";
  return {
    title: `${baseTitle} queued`,
    detail: "This build is queued and will start automatically when a development slot becomes free.",
    remainingLabel: "Queued",
    progress: 0,
    note: "Queued builds hold their place in line and can be cancelled before they start.",
    cancelLabel: "Cancel queued build",
    cancelActionId: "cancel_queued_build"
  };
};

// Owner-economy fields (isFed, supportCurrent/Max, foodUpkeepPerMinute, etc.)
// only ride the snapshot and REQUEST_TILE_DETAIL responses — they are NOT in
// the TILE_DELTA_BATCH town payload. So between a delta arriving and the
// gateway answering the follow-up tile-detail request, an own settled town
// can read back without those fields. Detect that window so the panel can
// show per-row loaders instead of silently rendering 0/m and hiding rows.
export const ownTownEconomyFieldsPartial = (tile: Tile, viewerId: string): boolean =>
  Boolean(
    tile.ownerId === viewerId &&
      tile.ownershipState === "SETTLED" &&
      tile.town &&
      tile.town.populationTier !== "SETTLEMENT" &&
      typeof tile.town.isFed !== "boolean"
  );

const tileTownPartialLoadingRowHtml = (
  tileKey: string,
  label: string,
  loadingSinceMs: number
): string =>
  `<div class="tile-town-loading tile-town-loading-row" role="status" aria-live="polite">` +
    `<span class="tile-town-loading-spinner" aria-hidden="true"></span>` +
    `<span class="tile-town-loading-label"><strong>${label}:</strong> loading <span class="tile-town-loading-timer" data-loading-timer-since="${loadingSinceMs}">0s</span></span>` +
    `<button type="button" class="tile-town-debug-btn" data-tile-debug-download="${tileKey}">Report</button>` +
  `</div>`;

export const menuOverviewForTile = (
  tile: Tile,
  deps: {
    state: { me: string; upkeepLastTick?: { foodCoverage?: number } };
    prettyToken: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    displayTownGoldPerMinute: (tile: Tile) => number;
    populationPerMinuteLabel: (value: number) => string;
    townNextGrowthEtaLabel: (town: NonNullable<Tile["town"]>, options?: { explainUnfed?: boolean }) => string;
    supportedOwnedTownsForTile: (tile: Tile) => Tile[];
    connectedDockCountForTile: (tile: Tile) => number;
    currentManpower: number;
    currentManpowerCap: number;
    hostileObservatoryProtectingTile: (tile: Tile) => unknown;
    constructionCountdownLineForTile: (tile: Tile) => string;
    tileHistoryLines: (tile: Tile) => string[];
    isTileOwnedByAlly: (tile: Tile) => boolean;
    areaEffectModifiersForTile: (tile: Tile) => TileAreaEffectModifier[];
    // Returns the ms timestamp at which this tile was first observed missing
    // owner-economy fields. The caller (typically the action-flow wrapper) is
    // responsible for seeding the timestamp on the partial-state transition
    // and clearing it on resolve, so the render itself stays pure.
    townPartialLoadingStartedAt: (tileKey: string) => number;
  }
): TileOverviewLine[] => {
  const lines: TileOverviewLine[] = [];
  const modifierLines: TileOverviewLine[] = [];
  const hasOwnedLandState = Boolean(tile.ownerId) && tile.terrain === "LAND";
  const pushLine = (html: string): void => {
    lines.push({ html });
  };
  const pushEffectLine = (name: string, mod: string, tone: "positive" | "negative" | "neutral"): void => {
    modifierLines.push({
      kind: "effect",
      html: `<span class="tile-overview-effect-name">${name}:</span><span class="tile-overview-effect-mod is-${tone}">${mod}</span>`
    });
  };
  const ownerKind =
    !tile.ownerId
      ? "unclaimed"
      : tile.ownerId === deps.state.me
        ? tile.ownershipState === "FRONTIER"
          ? "mine-frontier"
          : "mine-settled"
        : deps.isTileOwnedByAlly(tile)
          ? "ally"
          : "enemy";
  const productionLabel = tileProductionRequirementLabel(tile, deps.prettyToken);
  const resourceLabelText = tile.resource ? deps.prettyToken(strategicResourceKeyForTile(tile) ?? resourceLabel(tile.resource)) : undefined;
  const productionHtml = tileProductionHtml(tile);
  tileMenuOverviewIntroLines({
    terrain: tile.terrain,
    ownerKind,
    productionLabel,
    resourceLabel: resourceLabelText,
    isDockEndpoint: Boolean(tile.dockId),
    hasTown: Boolean(tile.town),
    isDecaying: isFrontierNaturallyDecaying(tile)
  }).forEach(pushLine);
  if (tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA" || tile.terrain === "MOUNTAIN") return lines;
  if (tile.ownershipState === "SETTLED" && tile.town?.populationTier === "SETTLEMENT") {
    pushLine("Settlements provide starter gold and manpower until they grow into towns.");
  }
  if (tile.shardSite) {
    pushLine(
      tile.shardSite.kind === "FALL"
        ? `Shard rain deposit: ${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} can be collected here for a short time.`
        : `Shard cache: ${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} can be recovered here.`
    );
  }
  const isSettled = tile.ownershipState === "SETTLED";
  const supportedTowns = tile.ownerId === deps.state.me && isSettled ? deps.supportedOwnedTownsForTile(tile) : [];
  const ownTownEconomyPartial = ownTownEconomyFieldsPartial(tile, deps.state.me);
  const ownTownLoadingTileKey = ownTownEconomyPartial ? `${tile.x},${tile.y}` : "";
  const ownTownLoadingSince = ownTownEconomyPartial ? deps.townPartialLoadingStartedAt(ownTownLoadingTileKey) : 0;
  const pushOwnTownLoadingRow = (label: string): void => {
    if (!ownTownLoadingTileKey) return;
    lines.push({
      kind: "loading",
      html: tileTownPartialLoadingRowHtml(ownTownLoadingTileKey, label, ownTownLoadingSince)
    });
  };
  if (tile.town) {
    // Foreign towns under satellite reveal carry only public fields
    // (type/tier/population/maxPopulation/connected*). When the owner-only
    // economy fields are absent we hide private-info lines instead of
    // rendering misleading defaults like "Town is unfed" or "Support 0/0".
    const hasOwnerEconomyData = typeof tile.town.isFed === "boolean";
    const hasFullFoodCoverage = (deps.state.upkeepLastTick?.foodCoverage ?? 1) >= 0.999;
    if (!hasOwnedLandState) {
      pushLine("Neutral town. Claim and settle this tile to start its economy.");
    } else if (!isSettled) {
      pushLine("Settle this tile to activate the town's economy and start gold income.");
    } else if (tile.town.populationTier === "SETTLEMENT") {
      // No prose income line — the unified `Production: X/m` row below shows the same value.
    } else if (
      hasOwnerEconomyData &&
      !tile.town.isFed &&
      !hasFullFoodCoverage &&
      (tile.town.goldPerMinute ?? 0) <= 0.001 &&
      (tile.town.populationGrowthPerMinute ?? 0) <= 0.001
    ) {
      pushLine("Town is unfed. Add more FOOD upkeep coverage or settle nearby fish or grain.");
    } else if (
      tile.town.goldIncomePausedReason === "MANPOWER_NOT_FULL" &&
      deps.currentManpower + 0.001 < deps.currentManpowerCap
    ) {
      pushLine("Town is fed but gold is paused until your empire manpower is full.");
    }
    if (hasOwnedLandState && isSettled && tile.town.connectedTownCount === 0 && tile.town.populationTier !== "SETTLEMENT") {
      pushLine("Connect this town to other towns to gain bonus gold production.");
    }
    if (hasOwnedLandState && isSettled && hasOwnerEconomyData && tile.town.populationTier !== "SETTLEMENT") {
      const supportCurrent = Number.isFinite(tile.town.supportCurrent) ? tile.town.supportCurrent : 0;
      const supportMax = Number.isFinite(tile.town.supportMax) ? tile.town.supportMax : 0;
      pushLine(`Support ${supportCurrent}/${supportMax}`);
    } else if (ownTownEconomyPartial) {
      pushOwnTownLoadingRow("Support");
    }
    pushLine(`Population ${Math.round(tile.town.population).toLocaleString()} • ${displayTownPopulationTierLabel(tile.town.populationTier)}`);
    if (isSettled && hasOwnerEconomyData) {
      const townForGrowth = hasFullFoodCoverage && tile.town.isFed === false ? { ...tile.town, isFed: true } : tile.town;
      pushLine(`Growth ${deps.populationPerMinuteLabel(tile.town.populationGrowthPerMinute ?? 0)}`);
      pushLine(`Next size: ${deps.townNextGrowthEtaLabel(townForGrowth, { explainUnfed: tile.ownerId === deps.state.me })}.`);
    } else if (ownTownEconomyPartial) {
      pushOwnTownLoadingRow("Growth");
    }
  } else if (tile.townDataPartial) {
    // We received a town payload but it failed the renderable gate
    // (population missing or below the 500 floor). Treat as in-flight and
    // let the player capture a debug log if it stays stuck.
    const tileKey = `${tile.x},${tile.y}`;
    lines.push({
      kind: "loading",
      html:
        `<div class="tile-town-loading" role="status" aria-live="polite">` +
        `<span class="tile-town-loading-spinner" aria-hidden="true"></span>` +
        `<span class="tile-town-loading-label">Loading town details…</span>` +
        `<button type="button" class="tile-town-debug-btn" data-tile-debug-download="${tileKey}">Download debug log</button>` +
        `</div>`
    });
  } else if (tile.resource) {
    if (tile.ownershipState === "SETTLED" && !productionHtml) {
      pushLine(`Resource node can produce ${(resourceLabelText ?? "resources").toLowerCase()} once developed and collected.`);
    }
  }
  if (tile.dockId && tile.ownershipState === "SETTLED") {
    const connectedDockCount = tile.dock?.connectedDockCount ?? deps.connectedDockCountForTile(tile);
    const DOCK_BASE_INCOME_PER_MIN = 0.5;
    const goldPerMinute = tile.dock?.goldPerMinute ?? DOCK_BASE_INCOME_PER_MIN;
    pushLine(`Dock income ${goldPerMinute.toFixed(2)} gold/m`);
    pushLine(connectedDockCount === 0
      ? "Not connected to any other docks yet."
      : `Connected to ${connectedDockCount} dock${connectedDockCount === 1 ? "" : "s"}.`);
    if (connectedDockCount === 0) pushLine("Connect this dock to other docks to gain bonus gold production.");
    if (tile.dock?.modifiers?.length) {
      for (const modifier of tile.dock.modifiers) {
        pushLine(`${modifier.label}: +${modifier.percent.toFixed(0)}% (+${modifier.deltaGoldPerMinute.toFixed(2)} gold/m)`);
      }
    }
  }
  if (ownTownEconomyPartial) {
    pushOwnTownLoadingRow("Production");
  } else if (productionHtml && hasOwnedLandState && isSettled) {
    pushLine(`Production: ${productionHtml}`);
  }
  if (ownTownEconomyPartial) {
    pushOwnTownLoadingRow("Upkeep");
  } else if (hasOwnedLandState && isSettled) {
    lines.push(...tileOverviewUpkeepLines(tile));
  }
  if (supportedTowns.length === 1) {
    const town = supportedTowns[0];
    if (town) {
      pushLine(town.town?.name ? `Support tile for ${town.town.name}.` : `Support tile for nearby town at (${town.x}, ${town.y}).`);
      const contributionLine = supportContributionLine(tile, town); if (contributionLine) pushLine(contributionLine);
      if (town.town?.hasMarket) pushLine("Nearby town already has a Market.");
      if (town.town?.hasGranary) pushLine("Nearby town already has a Granary.");
      if (!tile.economicStructure) pushLine("Town buildings like markets and granaries must be built on support tiles.");
    }
  } else if (supportedTowns.length > 1) {
    pushLine("This support tile touches multiple towns.");
  }
  if (tile.observatory) {
    if (tile.observatory.status === "active") {
      pushLine("Observatory is active here and blocks hostile crystal actions nearby.");
      const cooldownRemainingMs = (tile.observatory.cooldownUntil ?? 0) - Date.now();
      if (tile.ownerId === deps.state.me && cooldownRemainingMs > 0) {
        const totalSeconds = Math.ceil(cooldownRemainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        pushLine(`Crystal casting recharging — ready in ${clock}.`);
      }
    } else if (tile.observatory.status === "under_construction") {
      pushLine("Observatory is under construction on this tile.");
    } else {
      pushLine("Observatory is inactive here and currently provides no vision or protection.");
    }
  }
  const captureRecoveryRemainingMs = captureRecoveryRemainingMsForTile(tile);
  const structureRecentlyCaptured = captureRecoveryRemainingMs !== undefined;
  if (tile.fort?.status === "active" && structureRecentlyCaptured) {
    pushLine("Recently captured. Fort defense is offline until the capture shock timer ends.");
  }
  if (MUSTER_SYSTEM_ENABLED && tile.fort?.status === "active" && !structureRecentlyCaptured) {
    const garrison = tile.fort.garrison ?? 0;
    const garrisonCap = tile.fort.garrisonCap ?? 0;
    if (garrisonCap > 0) {
      const pct = Math.round((garrison / garrisonCap) * 100);
      const required = Math.max(MUSTER_ATTACK_COST, Math.ceil(garrison));
      pushLine(`Garrison: ${Math.floor(garrison)} / ${Math.floor(garrisonCap)} (${pct}%) — capturing requires ${required} mustered manpower.`);
    }
  }
  if (tile.economicStructure) {
    if (tile.economicStructure.status === "removing") {
      pushLine("Removal is underway. Income, upkeep, and structure effects are currently disabled.");
    }
    if (isSynthLikeStructureType(tile.economicStructure.type)) {
      if (tile.economicStructure.status === "active") {
        pushLine("Structure is active and currently contributing output and upkeep.");
      } else if (structureRecentlyCaptured) {
        pushLine("Recently captured. Structure stays offline during capture shock and contributes no output or upkeep until the timer ends.");
      } else if (tile.economicStructure.disabledUntil && tile.economicStructure.disabledUntil > Date.now()) {
        pushLine("Structure is disabled while recovering from overload and currently contributes no output or upkeep.");
      } else if (tile.economicStructure.inactiveReason === "upkeep") {
        pushLine("Structure shut down after gold upkeep ran out and must be manually re-enabled before it contributes output or upkeep again.");
      } else if (tile.economicStructure.inactiveReason === "manual") {
        pushLine("Structure is manually disabled and currently contributes no output or upkeep until you re-enable it.");
      } else if (tile.economicStructure.status === "inactive") {
        pushLine("Structure is disabled and currently contributes no output or upkeep.");
      }
    } else if (structureRecentlyCaptured) {
      pushLine("Recently captured. Structure stays offline during capture shock and contributes no output or upkeep until the timer ends.");
    } else if (tile.economicStructure.status === "inactive") {
      pushLine("Structure is inactive and currently contributes no output or upkeep.");
    }
  }
  for (const modifier of tileOverviewModifiersForTile(tile)) {
    pushEffectLine(modifier.reason, modifier.effect, modifier.tone);
  }
  for (const modifier of deps.areaEffectModifiersForTile(tile)) {
    pushEffectLine(modifier.reason, modifier.effect, modifier.tone);
  }
  if (modifierLines.length > 0) {
    lines.push({ html: "Modifiers", kind: "section" });
    lines.push(...modifierLines);
  }
  if (tile.fort?.status === "removing") {
    pushLine("Fort removal is underway. Defensive fortification from this tile is currently disabled.");
  }
  if (tile.observatory?.status === "removing") {
    pushLine("Observatory removal is underway. Vision, protection, and crystal-casting effects are currently disabled.");
  }
  if (tile.siegeOutpost?.status === "removing") {
    pushLine("Siege outpost removal is underway. Attack bonuses from this tile are currently disabled.");
  }
  const construction = deps.constructionCountdownLineForTile(tile);
  if (construction) pushLine(construction);
  for (const historyLine of deps.tileHistoryLines(tile)) pushLine(historyLine);
  return lines;
};

export const tileMenuViewForTile = (
  tile: Tile,
  deps: {
    menuActionsForSingleTile: (tile: Tile) => TileActionDef[];
    splitTileActionsIntoTabs: (actions: TileActionDef[]) => { actions: TileActionDef[]; buildings: TileActionDef[]; crystal: TileActionDef[] };
    settlementProgressForTile: (x: number, y: number) => TileMenuProgressView | undefined;
    queuedSettlementProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedBuildProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    constructionProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    menuOverviewForTile: (tile: Tile) => TileOverviewLine[];
    prettyToken: (value: string) => string;
    playerNameForOwner: (ownerId?: string | null) => string | undefined;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    isTileOwnedByAlly: (tile: Tile) => boolean;
    state: { me: string };
  }
): TileMenuView => {
  const actions = deps.menuActionsForSingleTile(tile);
  const actionTabs = deps.splitTileActionsIntoTabs(actions);
  const settlement = deps.settlementProgressForTile(tile.x, tile.y);
  const queuedSettlement = deps.queuedSettlementProgressForTile(tile);
  const queuedBuild = deps.queuedBuildProgressForTile(tile);
  const construction = deps.constructionProgressForTile(tile);
  const progress = settlement ?? queuedSettlement ?? queuedBuild ?? construction;
  const buildBlockedByQueue = Boolean(queuedBuild);
  const visibleBuildings = buildBlockedByQueue ? [] : actionTabs.buildings;
  const tabs: TileMenuTab[] = [];
  const canShowBuildingsTab =
    !buildBlockedByQueue &&
    tile.ownerId === deps.state.me &&
    tile.ownershipState === "SETTLED" &&
    (tile.terrain === "LAND" || Boolean(tile.dockId));
  if (progress) tabs.push("progress");
  if (actionTabs.actions.length > 0) tabs.push("actions");
  if (visibleBuildings.length > 0 || canShowBuildingsTab) tabs.push("buildings");
  if (actionTabs.crystal.length > 0) tabs.push("crystal");
  tabs.push("overview");
  const regionLabel = tile.regionType ? deps.prettyToken(tile.regionType) : undefined;
  const foreignOwnerLabel = tile.ownerId ? (deps.playerNameForOwner(tile.ownerId) ?? tile.ownerId.slice(0, 8)) : undefined;
  const ownerLabel =
    (tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA")
      ? actions.length > 0
        ? "Crossing route"
        : "Open sea"
      : !tile.ownerId
        ? "Unclaimed"
        : tile.ownerId === deps.state.me
          ? tile.ownershipState === "FRONTIER"
            ? "Your frontier"
            : "Your settled land"
          : (foreignOwnerLabel ?? "Unknown empire");
  const ownerLabelIsAlly = Boolean(tile.ownerId) && tile.ownerId !== deps.state.me && tile.terrain !== "SEA" && tile.terrain !== "COASTAL_SEA" && deps.isTileOwnedByAlly(tile);
  const subtitleHtml = ownerLabelIsAlly
    ? [
        `<span class="tile-owner-label is-ally">${ownerLabel}</span>`,
        regionLabel ?? ""
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  const titleLabel =
    tile.town
      ? tile.town.name ?? deps.prettyToken(tile.town.populationTier === "SETTLEMENT" ? "SETTLEMENT" : tile.town.type)
      : tile.dockId
        ? "Dock"
        : tile.resource
          ? deps.prettyToken(resourceLabel(tile.resource))
          : deps.terrainLabel(tile.x, tile.y, tile.terrain);
  const headerStatus = tileMenuHeaderStatusForTile(tile);
  return {
    title: `${titleLabel} (${tile.x}, ${tile.y})`,
    subtitle: tileMenuSubtitleText(ownerLabel, regionLabel),
    ...(subtitleHtml ? { subtitleHtml } : {}),
    ...(headerStatus ? { statusText: headerStatus.text, statusTone: headerStatus.tone } : {}),
    tabs,
    ...(tile.ownershipState === "FRONTIER" ? { overviewKicker: "Frontier" } : tile.ownershipState === "SETTLED" ? { overviewKicker: "Settled" } : {}),
    overviewLines: deps.menuOverviewForTile(tile),
    actions: actionTabs.actions,
    buildings: visibleBuildings,
    crystal: actionTabs.crystal,
    ...(progress ? { progress } : {})
  };
};
