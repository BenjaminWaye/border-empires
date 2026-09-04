import {
  requiredMusterForTarget,
  structureSlotRequirements,
  nextTownGrowthUpgrade,
  TOWN_MANPOWER_BY_TIER,
  townFoodSlotDemandForTier,
  type SlotResource,
  type SlotStructureType
} from "@border-empires/shared";
import { mintworksGoldProductionMultiplier } from "@border-empires/game-domain";
import { resourceSlotProductionHtml } from "./client-tile-resource-slot-production.js";
import { isConverterStructureType } from "../client-converter-menu.js";
import { weaponsFactoryOwnBonusLine } from "../client-weapons-factory-overview/client-weapons-factory-overview.js";
import { resourceLabel, strategicResourceKeyForTile, tileProductionHtml } from "../client-map-display.js";
import { naturalWonderOverviewLine, tileOverviewModifiersForTile } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import { tileMenuOverviewIntroLines, tileMenuSubtitleText } from "../client-tile-menu-copy/client-tile-menu-copy.js";
import { captureRecoveryRemainingMsForTile, tileMenuHeaderStatusForTile } from "../client-tile-menu-status/client-tile-menu-status.js";
import { authoritativeIsInReach, type ReachAuthoritativeState } from "../client-reach-authoritative/client-reach-authoritative.js"; import { keyForTile } from "../client-app-runtime-utils.js";
import { tileOverviewUpkeepLines } from "../client-tile-upkeep-view.js";
import { townStatGridHtml } from "../client-town-stat-grid/client-town-stat-grid.js";
import { isFoundingEngineerPlayerId, tileOwnerLabelHtml } from "../client-founding-engineer/client-founding-engineer.js";
import type { TileAreaEffectModifier } from "../client-structure-effects/client-structure-effects.js";
import type { OptimisticStructureKind, Tile, TileActionDef, TileCombatBreakdown, TileMenuProgressView, TileMenuTab, TileMenuView, TileOverviewLine } from "../client-types.js";

// buildDetailTextForAction lives in its own file now (file-line-cap) — kept
// exported from here too so existing importers of "./client-tile-menu-view.js"
// don't need to change their import path.
export { buildDetailTextForAction } from "../client-tile-action-detail-text/client-tile-action-detail-text.js";

// §14.2: dormant/unpowered structure indicator. slotStructureTypeForField
// mirrors Runtime.isStructureDormant's own field->slot-type mapping
// (apps/simulation/src/runtime/runtime.ts) so the client and server can
// never disagree on which structure a dormancy key refers to.
type DormancyField = "fort" | "observatory" | "siegeOutpost" | "economicStructure";

const slotStructureTypeForField = (tile: Tile, field: DormancyField): SlotStructureType | undefined => {
  if (field === "fort" && tile.fort) return (tile.fort.variant ?? "FORT") as SlotStructureType;
  if (field === "observatory" && tile.observatory) return "OBSERVATORY";
  if (field === "siegeOutpost" && tile.siegeOutpost) return (tile.siegeOutpost.variant ?? "SIEGE_OUTPOST") as SlotStructureType;
  if (field === "economicStructure" && tile.economicStructure) return tile.economicStructure.type as SlotStructureType;
  return undefined;
};

const SLOT_RESOURCE_TILE_HINT: Record<SlotResource, string> = {
  FOOD: "a Farm or Fish tile",
  TITANIUM: "a Titanium tile",
  CRYSTAL: "a Crystal tile",
  UMBRITE: "an Umbrite tile"
};

const dormantStructureLineHtml = (
  tile: Tile,
  field: DormancyField,
  dormantResources: SlotResource[] | undefined
): string | undefined => {
  if (!dormantResources || dormantResources.length === 0) return undefined;
  const slotType = slotStructureTypeForField(tile, field);
  if (!slotType) return undefined;
  const needed = structureSlotRequirements(slotType).filter((req) => dormantResources.includes(req.resource));
  if (needed.length === 0) return undefined;
  const parts = needed.map(
    (req) => `${req.count} ${req.resource === "FOOD" ? "Food" : req.resource === "TITANIUM" ? "Titanium" : req.resource === "CRYSTAL" ? "Crystal" : "Umbrite"} slot${req.count === 1 ? "" : "s"} (settle or capture ${SLOT_RESOURCE_TILE_HINT[req.resource]})`
  );
  return `<span class="tile-overview-dormant">⚠ Dormant — no free resource slot. Needs ${parts.join(" and ")}.</span>`;
};

export const tileProductionRequirementLabel = (tile: Tile, prettyToken: (value: string) => string): string | undefined => {
  if (tile.town) return "gold";
  const strategicKey = strategicResourceKeyForTile(tile);
  if (strategicKey) return prettyToken(strategicKey).toLowerCase();
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  if (gpm > 0.01) return "gold";
  return undefined;
};

// constructionProgressForTile moved to
// ../client-tile-menu-construction-progress/client-tile-menu-construction-progress.ts
// (this file is already over the 500-line growth cap) -- re-exported here so
// existing importers of this path don't need to change.
export { constructionProgressForTile } from "../client-tile-menu-construction-progress/client-tile-menu-construction-progress.js";

// queuedSettlementProgressForTile / queuedBuildProgressForTile moved to
// ../client-tile-menu-queue-progress/client-tile-menu-queue-progress.ts
// (this file is already over the 500-line growth cap).

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
    // §14.2: dormant/unpowered structure indicator — the resource(s) this
    // tile's given structure field is currently short on, or undefined when
    // it's powered. Only meaningful for the caller's own structures; callers
    // should return undefined for tiles not owned by the viewing player.
    // Optional so existing callers/tests that haven't threaded it through
    // yet just render without a dormancy line.
    dormantResourcesForTile?: (tile: Tile, field: DormancyField) => SlotResource[] | undefined;
  }
): TileOverviewLine[] => {
  const lines: TileOverviewLine[] = [];
  const modifierLines: TileOverviewLine[] = [];
  const hasOwnedLandState = Boolean(tile.ownerId) && tile.terrain === "LAND";
  const pushLine = (html: string): void => {
    lines.push({ html });
  };
  const pushEffectLine = (name: string, mod: string, tone: "positive" | "negative" | "neutral", options?: { nested?: boolean }): void => {
    modifierLines.push({
      kind: "effect",
      ...(options?.nested ? { nested: true } : {}),
      html: `<span class="tile-overview-effect-name">${name}:</span><span class="tile-overview-effect-mod is-${tone}">${mod}</span>`
    });
  };
  // Unified building modifier display (stage 3): "<count> <Building>"
  // heading followed by that building's own stat lines, indented under it —
  // see menuOverviewForTile's townModifierTotals loop below for the only
  // caller. A plain flat list here read as duplicated info when two
  // different buildings fed the same bare stat name (e.g. two unlabeled
  // "Gold production" lines with different percentages); a heading per
  // building traces every number back to its source.
  const pushModifierGroup = (heading: string, modifiers: Array<{ statLabel: string; valueText: string; tone: "positive" | "negative" | "neutral" }>): void => {
    modifierLines.push({ kind: "group", html: heading });
    for (const modifier of modifiers) pushEffectLine(modifier.statLabel, modifier.valueText, modifier.tone, { nested: true });
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
    hasTown: Boolean(tile.town)
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
  } const naturalWonderLine = naturalWonderOverviewLine(tile, ownerKind); if (naturalWonderLine) pushLine(naturalWonderLine);
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
  // Set true when the town's Population/Gold/Manpower(/Support/Food) render
  // as the unified stat grid below instead of individual prose lines — the
  // later Production-line push (after the dock section) checks this so it
  // doesn't duplicate the grid's own Gold card for the same tile.
  let showsTownStatGrid = false;
  if (tile.town) {
    // Foreign towns under satellite reveal carry only public fields; absent owner-only economy
    // fields hide private-info lines instead of rendering misleading defaults like "Town is unfed" or "Support 0/0".
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
    }
    if (hasOwnedLandState && isSettled && tile.town.connectedTownCount === 0 && tile.town.populationTier !== "SETTLEMENT") {
      pushLine("Connect this town to other towns to gain bonus gold production.");
    }
    showsTownStatGrid = hasOwnedLandState && isSettled && hasOwnerEconomyData;
    if (showsTownStatGrid) {
      const supportCurrent = Number.isFinite(tile.town.supportCurrent) ? tile.town.supportCurrent : 0;
      const supportMax = Number.isFinite(tile.town.supportMax) ? tile.town.supportMax : 0;
      // FOOD slot demand is what actually gates a town's isFed state (see
      // resource-slot-view.ts's per-town FOOD contributor) — allocation is
      // all-or-nothing per town, so "satisfied" is either the full demand
      // (fed) or 0 (unfed), never a partial count. This is the pre-waiver
      // base demand — a nearby Governor's Office can reduce it further, but
      // that isn't visible client-side, so a fed Governor's-Office town may
      // show a demand slightly higher than what it's actually clearing.
      const foodDemand = townFoodSlotDemandForTier(tile.town.populationTier);
      const townForGrowth = hasFullFoodCoverage && tile.town.isFed === false ? { ...tile.town, isFed: true } : tile.town;
      const effectiveFed = Boolean(townForGrowth.isFed);
      // Base manpower cap/regen this town's tier grants the empire (before
      // Garrison Hall/Assembly Works cap bonuses, which surface separately via
      // townModifierTotals below, and before the settle-order regen scaling in
      // manpowerRegenWeightForSettlementIndex — that weight depends on this
      // town's rank among owned towns, unavailable client-side, so this shows the unscaled base only).
      const tierManpower = TOWN_MANPOWER_BY_TIER[tile.town.populationTier];
      // Matches tileProductionHtml's own gold math exactly (same
      // tile.yieldRate.goldPerMinute * 1440 source) so this card's number
      // never disagrees with any other gold/day figure shown elsewhere.
      const goldPerDay = (tile.yieldRate?.goldPerMinute ?? 0) * 1440;
      const nextTierPopulation = nextTownGrowthUpgrade(tile.town.populationTier, tile.town.population)?.requiredPopulation;
      lines.push({
        kind: "statgrid",
        html: townStatGridHtml({
          population: Math.round(tile.town.population),
          maxPopulation: Math.round(tile.town.maxPopulation),
          ...(nextTierPopulation !== undefined ? { nextTierPopulation } : {}),
          populationTierLabel: displayTownPopulationTierLabel(tile.town.populationTier),
          growthText: effectiveFed
            ? `${deps.populationPerMinuteLabel(tile.town.populationGrowthPerMinute ?? 0)} — ${deps.townNextGrowthEtaLabel(townForGrowth, { explainUnfed: tile.ownerId === deps.state.me })}`
            : "Growth paused — town is unfed",
          growthTone: effectiveFed ? "positive" : "warn",
          goldPerDayLabel: goldPerDay.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          manpowerCapLabel: tierManpower ? tierManpower.cap.toLocaleString() : "0",
          manpowerRegenLabel: tierManpower ? `+${tierManpower.regenPerMinute.toFixed(2)}/min base regen` : "",
          ...(tile.town.populationTier !== "SETTLEMENT" ? { support: { current: supportCurrent, max: supportMax } } : {}),
          ...(foodDemand > 0 ? { food: { satisfied: tile.town.isFed ? foodDemand : 0, demand: foodDemand, fed: Boolean(tile.town.isFed) } } : {})
        })
      });
    } else if (ownTownEconomyPartial) {
      pushOwnTownLoadingRow("Support");
      pushOwnTownLoadingRow("Food");
      pushLine(`Population ${Math.round(tile.town.population).toLocaleString()} • ${displayTownPopulationTierLabel(tile.town.populationTier)}`);
      pushOwnTownLoadingRow("Growth");
      pushOwnTownLoadingRow("Manpower");
    } else {
      pushLine(`Population ${Math.round(tile.town.population).toLocaleString()} • ${displayTownPopulationTierLabel(tile.town.populationTier)}`);
    }
    // Unified building modifier display (stage 3): one "<count> <Building>"
    // heading per support-ring building type, with that building's own
    // stat lines nested under it (e.g. "3 Garrison Halls" → Manpower cap:
    // +450) — see pushModifierGroup above.
    if (isSettled && hasOwnerEconomyData) {
      for (const group of tile.town.townModifierTotals ?? []) {
        pushModifierGroup(group.heading, group.modifiers);
      }
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
  } else if (tile.resource && tile.ownershipState === "SETTLED" && !productionHtml) {
    const slotHtml = resourceSlotProductionHtml(tile);
    if (slotHtml) pushLine(`Production: ${slotHtml}`);
  }
  if (tile.dockId && tile.ownershipState === "SETTLED") {
    const connectedDockCount = tile.dock?.connectedDockCount ?? deps.connectedDockCountForTile(tile);
    // Mirrors DOCK_INCOME_PER_MIN (game-domain/server-game-constants.ts):
    // 0.5 / GOLD_RESCALE_DIVISOR(288). Only used as a fallback when the
    // server hasn't sent tile.dock.goldPerMinute yet — the raw pre-rescope
    // 0.5 value here previously showed 288x the real dock income.
    const DOCK_BASE_INCOME_PER_MIN = 0.5 / 288;
    const goldPerMinute = tile.dock?.goldPerMinute ?? DOCK_BASE_INCOME_PER_MIN;
    pushLine(`Dock income ${(goldPerMinute * 1440).toFixed(1)} gold/day`);
    pushLine(connectedDockCount === 0
      ? "Not connected to any other docks yet."
      : `Connected to ${connectedDockCount} dock${connectedDockCount === 1 ? "" : "s"}.`);
    if (connectedDockCount === 0) pushLine("Connect this dock to other docks to gain bonus gold production.");
    if (tile.dock?.modifiers?.length) {
      for (const modifier of tile.dock.modifiers) {
        pushLine(`${modifier.label}: +${modifier.percent.toFixed(0)}% (+${(modifier.deltaGoldPerMinute * 1440).toFixed(1)} gold/day)`);
      }
    }
  }
  if (ownTownEconomyPartial) {
    pushOwnTownLoadingRow("Production");
  } else if (productionHtml && hasOwnedLandState && isSettled && !showsTownStatGrid) {
    // The stat grid's own Gold card already covers this for a town tile
    // with full owner-economy data — this line stays for everything else
    // (resource-producing non-town tiles, docks-in-progress, partial
    // foreign-town public views, etc.).
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
      // mintworks-stacking task: Mintworks stack additively now, so "already has
      // a Mintworks" must not read as a discouragement to build another — show
      // the current count/bonus instead.
      if (town.town?.mintworksCount) {
        const currentMult = mintworksGoldProductionMultiplier(town.town.mintworksCount, Boolean(town.town.clearingHouseActive));
        pushLine(`Nearby town has ${town.town.mintworksCount} active Mintworks${town.town.mintworksCount === 1 ? "" : "s"} (+${Math.round((currentMult - 1) * 100)}% town gold production).`);
      }
      if (town.town?.hasGranary) pushLine("Nearby town already has a Granary.");
      if (!tile.economicStructure) pushLine("Town buildings like mintworks and granaries must be built on support tiles.");
    }
  } else if (supportedTowns.length > 1) {
    pushLine("This support tile touches multiple towns.");
  }
  if (tile.observatory) {
    if (tile.observatory.status === "active" && tile.ownerId === tile.observatory.ownerId) {
      pushLine("Aether Tower is active here and blocks hostile crystal actions nearby.");
      const cooldownRemainingMs = (tile.observatory.cooldownUntil ?? 0) - Date.now();
      if (tile.ownerId === deps.state.me && cooldownRemainingMs > 0) {
        const totalSeconds = Math.ceil(cooldownRemainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        pushLine(`Crystal casting recharging — ready in ${clock}.`);
      }
    } else if (tile.observatory.status === "under_construction") {
      pushLine("Aether Tower is under construction on this tile.");
    } else {
      pushLine("Aether Tower is inactive here and currently provides no vision or protection.");
    }
    if (tile.observatory.status === "active") {
      const dormantLine = dormantStructureLineHtml(tile, "observatory", deps.dormantResourcesForTile?.(tile, "observatory"));
      if (dormantLine) pushLine(dormantLine);
    }
  }
  const captureRecoveryRemainingMs = captureRecoveryRemainingMsForTile(tile);
  const structureRecentlyCaptured = captureRecoveryRemainingMs !== undefined;
  if (tile.fort?.status === "active" && tile.ownerId && structureRecentlyCaptured) {
    pushLine("Recently captured. Fort defense is offline until the capture shock timer ends.");
  }
  if (tile.fort?.status === "active" && tile.ownerId && !structureRecentlyCaptured) {
    // Same helper the client's own attack gate uses (findClosestMuster in
    // client-muster-attack-gate.ts), so the number shown here always matches
    // the muster the client will actually demand — including the cheap
    // barbarian-raid path, which the fort tier alone would overstate.
    const required = requiredMusterForTarget(tile);
    pushLine(`Capturing requires ${required} mustered manpower.`);
  }
  if (tile.fort?.status === "active") {
    const dormantLine = dormantStructureLineHtml(tile, "fort", deps.dormantResourcesForTile?.(tile, "fort"));
    if (dormantLine) pushLine(dormantLine);
  }
  if (tile.siegeOutpost?.status === "active") {
    const dormantLine = dormantStructureLineHtml(tile, "siegeOutpost", deps.dormantResourcesForTile?.(tile, "siegeOutpost"));
    if (dormantLine) pushLine(dormantLine);
  }
  if (tile.economicStructure) {
    if (tile.economicStructure.status === "removing") {
      pushLine("Removal is underway. Income, upkeep, and structure effects are currently disabled.");
    }
    if (isConverterStructureType(tile.economicStructure.type)) {
      if (tile.economicStructure.status === "active") {
        // No status/lock line here — see converter-mode-flip plan: the
        // "selling off its slot" status line and "Mode flip available in Xm"
        // cooldown line were removed from the overview per user decision.
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
    if (tile.economicStructure.status === "active") {
      const dormantLine = dormantStructureLineHtml(tile, "economicStructure", deps.dormantResourcesForTile?.(tile, "economicStructure"));
      if (dormantLine) pushLine(dormantLine);
      const ownBonusLine = tile.ownerId === tile.economicStructure.ownerId ? weaponsFactoryOwnBonusLine(tile) : undefined;
      if (ownBonusLine) pushLine(ownBonusLine);
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
    pushLine("Aether Tower removal is underway. Vision, protection, and crystal-casting effects are currently disabled.");
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
    captureProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedSettlementProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedBuildProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedExpandProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedWaypointProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedAutoSettleNextForTile: (tile: Tile) => TileMenuProgressView["queuedNext"];
    constructionProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    menuOverviewForTile: (tile: Tile) => TileOverviewLine[];
    prettyToken: (value: string) => string;
    playerNameForOwner: (ownerId?: string | null) => string | undefined;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    isTileOwnedByAlly: (tile: Tile) => boolean;
    combatBreakdownForTile?: (tile: Tile) => TileCombatBreakdown | undefined;
    state: { me: string } & Partial<ReachAuthoritativeState>;
    /**
     * True when this tile is the target of the player's own in-progress
     * frontier expansion — not owned yet, but about to be. Actions/tabs are
     * then derived from a virtual FRONTIER-owned copy of the tile so a
     * building can be picked and queued (settle + build) ahead of time; it
     * fires once the expansion resolves and ownership actually lands (see
     * autoSettleTargets/autoBuildTargets).
     */
    pendingOwnershipTile?: boolean;
  }
): TileMenuView => {
  const actionSourceTile: Tile = deps.pendingOwnershipTile ? { ...tile, ownerId: deps.state.me, ownershipState: "FRONTIER" } : tile;
  const actions = deps.menuActionsForSingleTile(actionSourceTile);
  const actionTabs = deps.splitTileActionsIntoTabs(actions);
  const combatBreakdown = actionTabs.actions.some((action) => action.id === "launch_attack")
    ? deps.combatBreakdownForTile?.(tile)
    : undefined;
  const settlement = deps.settlementProgressForTile(tile.x, tile.y);
  const capture = deps.captureProgressForTile(tile);
  const queuedSettlement = deps.queuedSettlementProgressForTile(tile);
  const queuedBuild = deps.queuedBuildProgressForTile(tile);
  const queuedExpand = deps.queuedExpandProgressForTile(tile);
  const queuedWaypoint = deps.queuedWaypointProgressForTile(tile);
  const construction = deps.constructionProgressForTile(tile);
  const primaryProgress = capture ?? settlement ?? queuedSettlement ?? queuedBuild ?? queuedExpand ?? queuedWaypoint ?? construction;
  // "then:" annotation only applies to whatever's actively running (usually
  // the capture card for an in-flight EXPAND) -- a queued settlement/build
  // has its own card already. Copies rather than mutates the builder's
  // returned object, since it isn't guaranteed to be a fresh literal.
  const queuedNext = primaryProgress && primaryProgress !== queuedSettlement && primaryProgress !== queuedBuild ? deps.queuedAutoSettleNextForTile(tile) : undefined;
  const progress = primaryProgress && queuedNext ? { ...primaryProgress, queuedNext } : primaryProgress;
  const buildBlockedByQueue = Boolean(queuedBuild);
  const visibleBuildings = buildBlockedByQueue ? [] : actionTabs.buildings;
  const tabs: TileMenuTab[] = [];
  const canShowBuildingsTab =
    !buildBlockedByQueue &&
    actionSourceTile.ownerId === deps.state.me &&
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
  const subtitleHtml = ownerLabelIsAlly || (tile.ownerId && tile.ownerId !== deps.state.me && tile.terrain !== "SEA" && tile.terrain !== "COASTAL_SEA" && isFoundingEngineerPlayerId(tile.ownerId))
    ? [tileOwnerLabelHtml(ownerLabel, tile.ownerId, ownerLabelIsAlly), regionLabel ?? ""].filter(Boolean).join(" · ")
    : undefined;
  const titleLabel =
    tile.town
      ? tile.town.name ?? deps.prettyToken(tile.town.populationTier === "SETTLEMENT" ? "SETTLEMENT" : tile.town.type)
      : tile.dockId
        ? "Dock"
        : tile.resource
          ? deps.prettyToken(resourceLabel(tile.resource))
          : deps.terrainLabel(tile.x, tile.y, tile.terrain);
  const reachState = deps.state; const headerStatus = tile.ownerId === reachState.me && reachState.tiles ? tileMenuHeaderStatusForTile(tile, Date.now(), (t) => authoritativeIsInReach(reachState as ReachAuthoritativeState, keyForTile)(t.x, t.y)) : tileMenuHeaderStatusForTile(tile); return {
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
    ...(progress ? { progress } : {}),
    ...(combatBreakdown ? { combatBreakdown } : {})
  };
};
