import {
  FORT_BUILD_MS,
  OBSERVATORY_VISION_BONUS,
  OBSERVATORY_BUILD_MS,
  SIEGE_OUTPOST_BUILD_MS,
  structureBuildDurationMs
} from "@border-empires/shared";
import { economicStructureBuildMs, economicStructureName, resourceLabel, storedYieldSummary, strategicResourceKeyForTile, tileProductionHtml } from "./client-map-display.js";
import { tileOverviewModifiersForTile } from "./client-tile-overview-modifiers.js";
import { tileMenuOverviewIntroLines, tileMenuSubtitleText } from "./client-tile-menu-copy.js";
import { captureRecoveryRemainingMsForTile, tileMenuHeaderStatusForTile } from "./client-tile-menu-status.js";
import { tileOverviewUpkeepLines } from "./client-tile-upkeep-view.js";
import type { TileAreaEffectModifier } from "./client-structure-effects.js";
import type { OptimisticStructureKind, Tile, TileActionDef, TileMenuProgressView, TileMenuTab, TileMenuView, TileOverviewLine } from "./client-types.js";

const isSynthLikeStructureType = (type: NonNullable<Tile["economicStructure"]>["type"]): boolean =>
  type === "FUR_SYNTHESIZER" ||
  type === "ADVANCED_FUR_SYNTHESIZER" ||
  type === "IRONWORKS" ||
  type === "ADVANCED_IRONWORKS" ||
  type === "CRYSTAL_SYNTHESIZER" ||
  type === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
  type === "FUEL_PLANT";

const structureNameForTile = (tile: Tile): string | undefined => {
  if (tile.fort) return "Fort";
  if (tile.observatory) return "Observatory";
  if (tile.siegeOutpost) return "Siege Outpost";
  if (tile.economicStructure) return economicStructureName(tile.economicStructure.type);
  return undefined;
};

export const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined => {
  const supportedTownLabel = supportedTown?.town?.name ? supportedTown.town.name : supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
  if (actionId === "settle_land") return "Makes this tile defended and activates production.";
  if (actionId === "build_fortification") {
    return tile.economicStructure?.type === "WOODEN_FORT"
      ? "Upgrade this Wooden Fort into a full fortification. +25% defense here. Active forts also stop failed attacks from losing the origin tile."
      : "Fortify this tile. +25% defense here. Active forts also stop failed attacks from losing the origin tile.";
  }
  if (actionId === "build_wooden_fort") return "Build a lighter fortification on this border or dock tile. Weaker than a full fort, but gold-only.";
  if (actionId === "build_observatory") return `Extends local vision by ${OBSERVATORY_VISION_BONUS} and blocks hostile crystal actions nearby.`;
  if (actionId === "build_siege_camp") {
    return tile.economicStructure?.type === "LIGHT_OUTPOST"
      ? "Upgrade this Light Outpost into a full siege outpost. Attacks from here hit 25% harder."
      : "Adds an offensive staging point on this border or dock tile. Attacks from here hit 25% harder.";
  }
  if (actionId === "build_light_outpost") return "Build a light outpost on this border or dock tile. It comes online fast, costs only gold, and grants a smaller attack bonus.";
  if (actionId === "build_farmstead") return "Improves food output on this tile by 50%.";
  if (actionId === "build_camp") return "Improves supply output on this tile by 50%.";
  if (actionId === "build_mine") return `Improves ${tile.resource === "IRON" ? "iron" : "crystal"} output on this tile by 50%.`;
  if (actionId === "build_market") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +50% fed gold output and +50% gold storage cap.`;
  }
  if (actionId === "build_granary") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +20% population growth and +20% gold storage cap.`;
  }
  if (actionId === "build_bank") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +50% city income and +1 flat income.`;
  }
  if (actionId === "build_airport") return "Build an airport on empty settled land. Bombard enemy tiles within 30 tiles for oil.";
  if (actionId === "build_caravanary") {
    return `Build on this support tile for ${supportedTownLabel}. Boosts its connected-town income bonus by 25%.`;
  }
  if (actionId === "build_fur_synthesizer") return "Convert heavy gold upkeep into steady supply output on this support tile with a Fur Synthesizer.";
  if (actionId === "upgrade_fur_synthesizer") return "Upgrade this Fur Synthesizer into an Advanced Fur Synthesizer with 20% higher output.";
  if (actionId === "build_ironworks") return "Convert heavy gold upkeep into steady iron output on this support tile.";
  if (actionId === "upgrade_ironworks") return "Upgrade this Ironworks into an Advanced Ironworks with 20% higher output.";
  if (actionId === "build_crystal_synthesizer") return "Convert heavy gold upkeep into steady crystal output on this support tile.";
  if (actionId === "upgrade_crystal_synthesizer") return "Upgrade this Crystal Synthesizer into an Advanced Crystal Synthesizer with 20% higher output.";
  if (actionId === "overload_fur_synthesizer") return "Spend 12500 gold for an instant supply burst, then shut this Fur Synthesizer down for 24 hours.";
  if (actionId === "overload_ironworks") return "Spend 12500 gold for an instant iron burst, then shut this ironworks down for 24 hours.";
  if (actionId === "overload_crystal_synthesizer") return "Spend 12500 gold for an instant crystal burst, then shut this synthesizer down for 24 hours.";
  if (actionId === "enable_converter_structure") return "Resume this converter. It immediately pays the next upkeep tick, then starts producing again.";
  if (actionId === "disable_converter_structure") return "Pause this converter. It stops paying upkeep and stops producing until you enable it again.";
  if (actionId === "build_fuel_plant") return "Convert heavy gold upkeep into steady oil output on this support tile.";
  if (actionId === "build_foundry") return "Industrial hub. Doubles active mine output within 10 tiles.";
  if (actionId === "build_garrison_hall") return "Defensive command center. Boosts settled-tile defense by 20% within 10 tiles.";
  if (actionId === "build_customs_house") return "Build on a settled dock tile. Increases income from that dock by 50%.";
  if (actionId === "build_governors_office") return "Administrative center. Reduces local food upkeep and settled-tile upkeep within 10 tiles.";
  if (actionId === "build_radar_system") return "Air defense grid. Blocks enemy airport bombardment within 30 tiles and reveals the attack origin.";
  if (actionId === "remove_structure") {
    const structureName = structureNameForTile(tile);
    if (!structureName) return undefined;
    if (tile.economicStructure) {
      return `Remove this ${structureName}. Its income, upkeep, and structure effects stay disabled until removal finishes.`;
    }
    if (tile.fort) return "Remove this Fort. Its defense bonus is disabled until removal finishes.";
    if (tile.observatory) return "Remove this Observatory. Its vision and protection effects are disabled until removal finishes.";
    if (tile.siegeOutpost) return "Remove this Siege Outpost. Its attack bonus is disabled until removal finishes.";
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

export const menuOverviewForTile = (
  tile: Tile,
  deps: {
    state: { me: string };
    prettyToken: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    displayTownGoldPerMinute: (tile: Tile) => number;
    populationPerMinuteLabel: (value: number) => string;
    townNextGrowthEtaLabel: (town: NonNullable<Tile["town"]>) => string;
    supportedOwnedTownsForTile: (tile: Tile) => Tile[];
    connectedDockCountForTile: (tile: Tile) => number;
    currentManpower: number;
    currentManpowerCap: number;
    hostileObservatoryProtectingTile: (tile: Tile) => unknown;
    constructionCountdownLineForTile: (tile: Tile) => string;
    tileHistoryLines: (tile: Tile) => string[];
    isTileOwnedByAlly: (tile: Tile) => boolean;
    areaEffectModifiersForTile: (tile: Tile) => TileAreaEffectModifier[];
  }
): TileOverviewLine[] => {
  const lines: TileOverviewLine[] = [];
  const modifierLines: TileOverviewLine[] = [];
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
    isDockEndpoint: Boolean(tile.dockId)
  }).forEach(pushLine);
  if (tile.resource && !tile.ownerId && resourceLabelText) {
    pushLine(`This ${resourceLabelText.toLowerCase()} node starts producing only after you claim and settle the tile.`);
  }
  if (tile.terrain === "SEA" || tile.terrain === "MOUNTAIN" || !tile.ownerId) return lines;
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
  const supportedTowns = tile.ownerId === deps.state.me && tile.ownershipState === "SETTLED" ? deps.supportedOwnedTownsForTile(tile) : [];
  if (tile.town) {
    if (tile.town.populationTier === "SETTLEMENT") {
      pushLine(`Settlement is producing ${deps.displayTownGoldPerMinute(tile).toFixed(2)} gold/m.`);
    } else if (!tile.town.isFed) {
      pushLine("Town is unfed. Needs settled fish or grain nearby.");
    } else if (
      tile.town.goldIncomePausedReason === "MANPOWER_NOT_FULL" &&
      deps.currentManpower + 0.001 < deps.currentManpowerCap
    ) {
      pushLine("Town is fed but gold is paused until your empire manpower is full.");
    }
    if (tile.town.connectedTownCount === 0 && tile.town.populationTier !== "SETTLEMENT") {
      pushLine("Connect this town to other towns to gain bonus gold production.");
    }
    if (tile.town.populationTier !== "SETTLEMENT") pushLine(`Support ${tile.town.supportCurrent}/${tile.town.supportMax}`);
    pushLine(`Population ${Math.round(tile.town.population).toLocaleString()} • ${deps.prettyToken(tile.town.populationTier)}`);
    pushLine(`Growth ${deps.populationPerMinuteLabel(tile.town.populationGrowthPerMinute ?? 0)}`);
    pushLine(`Next size: ${deps.townNextGrowthEtaLabel(tile.town)}.`);
  } else if (tile.resource) {
    if (tile.ownershipState === "SETTLED" && !productionHtml) {
      pushLine(`Resource node can produce ${(resourceLabelText ?? "resources").toLowerCase()} once developed and collected.`);
    }
  }
  if (tile.dockId && tile.ownershipState === "SETTLED") {
    const connectedDockCount = tile.dock?.connectedDockCount ?? deps.connectedDockCountForTile(tile);
    if (connectedDockCount === 0) pushLine("Connect this dock to other docks to gain bonus gold production.");
  }
  if (productionHtml) pushLine(`Production: ${productionHtml}`);
  lines.push(...tileOverviewUpkeepLines(tile));
  if (supportedTowns.length === 1) {
    const town = supportedTowns[0];
    if (town) {
      pushLine(town.town?.name ? `Support tile for ${town.town.name}.` : `Support tile for nearby town at (${town.x}, ${town.y}).`);
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
  const storedYield = storedYieldSummary(tile);
  if (storedYield) pushLine(`Stored yield: ${storedYield}`);
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
    tile.terrain === "SEA"
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
  const ownerLabelIsAlly = Boolean(tile.ownerId) && tile.ownerId !== deps.state.me && tile.terrain !== "SEA" && deps.isTileOwnedByAlly(tile);
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
