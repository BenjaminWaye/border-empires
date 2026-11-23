import type { SimulationEvent } from "@border-empires/sim-protocol";
import { appendPlayerEventLogEntry, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import { WAYSTATION_POP_BURST, WAYSTATION_REVEAL_RADIUS, WAYSTATION_VISION_REVEAL_TTL_MS, WAYSTATION_VISION_TOWN_SEARCH_RADIUS, type ResourceType, type SlotResource, type WaystationGrantedEffect } from "@border-empires/shared";
import { techEntryById } from "./tech-domain-bridge/tech-domain-bridge.js";
import { grantFreeTech, type TechGrantContext } from "./tech-grant-side-effects/tech-grant-side-effects.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";
import type { PendingWatchtowerReveal } from "./runtime-watchtower-reveal-tick.js";
import type { PersonalImpactWaystationActivated } from "./personal-impact-log/personal-impact-log.js";
import { grantWaystationGold, grantWaystationManpower, waystationResultDetailFields } from "./runtime-waystation-rewards.js";

export type WaystationVisibilityCoverage = Pick<VisibilityCoverageTracker, "addTemporaryRevealCells" | "isVisible">;

/** A VISION look to expire later: the runtime queues it with the watchtower pulses (runtime-watchtower-reveal-tick.ts). */
export type WaystationVisionReveal = Omit<PendingWatchtowerReveal, "kind"> & { kind: "waystation-vision" };

export type WaystationActivationInput = {
  now: () => number;
  tiles: Map<string, DomainTileState>;
  players: Map<string, DomainPlayer>;
  visibilityCoverage: WaystationVisibilityCoverage;
  visionTransitionCallbacks: VisibilityTransitionCallbacks;
  /** Removes the VISION effect's temporary reveal once `expiresAt` passes. */
  scheduleRevealExpiry: (reveal: WaystationVisionReveal) => void;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  recordPersonalImpact?: (event: PersonalImpactWaystationActivated) => void;
  /** Settles a player's accrued manpower regen (MANPOWER effect grants on top of the settled balance). */
  refreshManpower: (playerId: string) => void;
  playerManpowerCap: (playerId: string) => number;
  /**
   * The runtime's progression context: the TECH reward grants through
   * grantFreeTech, the same path paid research takes (supply bracket, cache
   * invalidation, AFC module install, resource reveal, TECH_UPDATE).
   */
  progressionContext: () => TechGrantContext;
  /** Injectable randomness for the one-of-six effect roll, then the tech pick within TECH / the tier pick within GOLD. Defaults to Math.random; tests pass a deterministic stub. */
  random?: () => number;
};

type WaystationEffect = WaystationGrantedEffect;

/** Effect roll order -- fixed and load-bearing for tests: 0=VISION, 1=POPULATION, 2=TECH, 3=RESOURCE_TILE, 4=GOLD, 5=MANPOWER. */
const WAYSTATION_EFFECTS: readonly WaystationEffect[] = ["VISION", "POPULATION", "TECH", "RESOURCE_TILE", "GOLD", "MANPOWER"];

const WAYSTATION_TILE_RESOURCES = {
  FOOD: "FARM",
  TITANIUM: "TITANIUM",
  CRYSTAL: "GEMS",
  UMBRITE: "UMBRITE"
} as const satisfies Record<SlotResource, ResourceType>;

const WAYSTATION_SLOT_RESOURCES: readonly SlotResource[] = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"];

/**
 * Finds the nearest tile owned by `playerId` that carries a town, measured
 * as flat (non-toroidal) squared distance from (x, y). A full-map scan is
 * acceptable here: activation only happens once per waystation, ever (there
 * are at most a few hundred on a 450x450 map), unlike the ring-radius lookup
 * in town-support-lookup.ts (assignedTownKeyForSupportTile), which is built
 * for a *specific* town's support ring and doesn't answer "which of my
 * towns, anywhere on the map, is closest to this arbitrary tile" -- the
 * question a waystation's population burst needs answered. Deliberately not
 * wrap-aware (unlike chebyshevDistance in season-seed-world.ts): a
 * waystation's town-support bonus going to the second-nearest town on a rare
 * across-the-seam case is a cosmetic miss, not a correctness bug worth the
 * extra plumbing.
 */
const nearestOwnedTownKey = (
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string | undefined => {
  let bestKey: string | undefined;
  let bestDistanceSq = Infinity;
  for (const [tileKey, tile] of tiles) {
    if (tile.ownerId !== playerId || !tile.town) continue;
    const dx = tile.x - x;
    const dy = tile.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && (!bestKey || tileKey < bestKey))) {
      bestDistanceSq = distanceSq;
      bestKey = tileKey;
    }
  }
  return bestKey;
};

/**
 * Finds the nearest tile carrying a town -- ANY owner, including
 * neutral/unowned -- within WAYSTATION_VISION_TOWN_SEARCH_RADIUS of (x, y),
 * measured as flat (non-toroidal) squared distance. Unlike
 * nearestOwnedTownKey this is not owner-restricted (the VISION effect reveals
 * a nearby settlement's location as a scouting reward, regardless of who
 * holds it) and is radius-bounded rather than a full-map scan, since "no town
 * anywhere nearby" is the common case and should stay cheap. Deterministic
 * tie-break by tileKey, mirroring nearestOwnedTownKey.
 *
 * Skips any town the activating player already has vision of: revealing a
 * town the player can already see is not a scouting reward, it's a no-op
 * dressed up as one. A closer already-visible town never blocks a farther
 * not-yet-visible one from being picked.
 */
const nearestTownKeyWithinRadius = (
  tiles: ReadonlyMap<string, DomainTileState>,
  coverage: WaystationVisibilityCoverage,
  playerId: string,
  x: number,
  y: number,
  radius: number
): string | undefined => {
  const radiusSq = radius * radius;
  let bestKey: string | undefined;
  let bestDistanceSq = Infinity;
  for (const [tileKey, tile] of tiles) {
    if (!tile.town) continue;
    if (coverage.isVisible(playerId, tileKey)) continue;
    const dx = tile.x - x;
    const dy = tile.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > radiusSq) continue;
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && (!bestKey || tileKey < bestKey))) {
      bestDistanceSq = distanceSq;
      bestKey = tileKey;
    }
  }
  return bestKey;
};

/**
 * Grants the VISION effect: a one-time look (WAYSTATION_VISION_REVEAL_TTL_MS)
 * of WAYSTATION_REVEAL_RADIUS around the nearest not-already-visible town (any
 * owner) within WAYSTATION_VISION_TOWN_SEARCH_RADIUS of the waystation's own
 * (x, y) -- a scouting reward pointing at a real settlement the player doesn't
 * already have eyes on (see nearestTownKeyWithinRadius). Falls back to the
 * waystation's own (x, y) when no such town is in range; this is a deliberate,
 * signed-off fallback (not a TODO). Once the look expires the tiles drop to
 * remembered fog: they entered coverage, so explored memory keeps them.
 *
 * It was a permanent footprint, reseeded at every boot, until 2026-11-23: a
 * player kept live sight of a rival town for the rest of the season (player
 * report). A restart before expiry ends the look early, as it does a scout
 * drone's flight. Returns the (x, y) revealed for the tile record and popup.
 */
const grantWaystationVision = (
  input: WaystationActivationInput,
  playerId: string,
  waystationKey: string,
  x: number,
  y: number
): { revealedAtX: number; revealedAtY: number } => {
  const townKey = nearestTownKeyWithinRadius(input.tiles, input.visibilityCoverage, playerId, x, y, WAYSTATION_VISION_TOWN_SEARCH_RADIUS);
  const townTile = townKey ? input.tiles.get(townKey) : undefined;
  const revealedAtX = townTile?.x ?? x;
  const revealedAtY = townTile?.y ?? y;
  const cellKeys = input.visibilityCoverage.addTemporaryRevealCells(playerId, revealedAtX, revealedAtY, WAYSTATION_REVEAL_RADIUS, input.visionTransitionCallbacks);
  input.scheduleRevealExpiry({ kind: "waystation-vision", tileKey: waystationKey, playerId, expiresAt: input.now() + WAYSTATION_VISION_REVEAL_TTL_MS, cellKeys });
  return { revealedAtX, revealedAtY };
};

/**
 * Grants the population-burst effect to the player's nearest owned town, if
 * any. Mirrors grantIncubationEnginePopulationBurst (runtime-structure-build-completion.ts)
 * but keyed off the nearest town rather than a specific support-ring town.
 * Returns the town's name and coordinates (for the client popup's copy and
 * its "Jump to Town" button) so the caller can record them on the
 * waystation tile's wire-visible detail -- undefined when there's no nearby
 * owned town (silent no-op); name alone can still be undefined separately
 * if the town has no name set.
 */
const grantWaystationPopulationBurst = (input: WaystationActivationInput, playerId: string, x: number, y: number, commandId: string): { name: string | undefined; x: number; y: number; populationBurst: number } | undefined => {
  const townKey = nearestOwnedTownKey(input.tiles, playerId, x, y);
  if (!townKey) return undefined;
  const townTile = input.tiles.get(townKey);
  if (!townTile?.town || townTile.ownerId !== playerId) return undefined;
  const updatedTownTile: DomainTileState = {
    ...townTile,
    town: {
      ...townTile.town,
      population: (townTile.town.population ?? 0) + WAYSTATION_POP_BURST,
      maxPopulation: (townTile.town.maxPopulation ?? 0) + WAYSTATION_POP_BURST
    }
  };
  input.replaceTileState(townKey, updatedTownTile, commandId);
  input.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [input.tileDeltaFromState(updatedTownTile)] });
  return { name: townTile.town.name, x: townTile.x, y: townTile.y, populationBurst: WAYSTATION_POP_BURST };
};

/**
 * Grants the TECH effect: picks a random tier-1 tech (a tree root -- no
 * prereqIds) the player does not already own, via the injected `random`, and
 * grants it through grantFreeTech -- the same steps paid research takes, so a
 * granted AFC module is installed and a connected client gets TECH_UPDATE.
 *
 * If the player already owns every tier-1 tech, nothing is granted here
 * (don't touch player state) and undefined is returned -- the caller then
 * falls back to the GOLD effect so the activation is never wasted.
 *
 * Returns the granted tech id, or undefined if no unowned tier-1 tech remains.
 */
const grantWaystationTech = (input: WaystationActivationInput, player: DomainPlayer, playerId: string, commandId: string, random: () => number): string | undefined => {
  const tierOneIds = [...techEntryById.values()].filter((tech) => tech.tier === 1 && !(tech.prereqIds && tech.prereqIds.length > 0)).map((tech) => tech.id);
  const unownedTierOneIds = tierOneIds.filter((id) => !player.techIds.has(id));
  if (unownedTierOneIds.length === 0) return undefined;
  const techId = unownedTierOneIds[Math.floor(random() * unownedTierOneIds.length) % unownedTierOneIds.length];
  if (!techId) return undefined;
  grantFreeTech(input.progressionContext(), player, techId, commandId);
  return techId;
};

/** Uses the existing waystation reward rule: lowest tracked resource balance, with ties in list order. */
const lowestBalanceWaystationResource = (player: DomainPlayer): SlotResource => {
  let target: SlotResource = "FOOD";
  let lowestCount = Infinity;
  for (const resource of WAYSTATION_SLOT_RESOURCES) {
    const count = player.strategicResources?.[resource] ?? 0;
    if (count < lowestCount) {
      lowestCount = count;
      target = resource;
    }
  }
  return target;
};

/**
 * Activates a dormant waystation on explicit collection (or AI capture).
 * Flips it to activated and grants exactly ONE of six possible
 * effects, chosen uniformly at random via the injected `random`
 * (defaults to Math.random) --
 *  0. VISION: a one-time look (a temporary reveal that expires after
 *     WAYSTATION_VISION_REVEAL_TTL_MS, like a watchtower's pulse) centered on
 *     the nearest unseen town within range, or the waystation's own tile;
 *  1. POPULATION: a population burst to the player's nearest owned town;
 *  2. TECH: a random unowned tier-1 tech, granted outright -- or GOLD if the
 *     player already owns every tier-1 tech;
 *  3. RESOURCE_TILE: a site for the resource with the lowest tracked balance;
 *  4. GOLD: a flat-tier treasury payout (WAYSTATION_GOLD_TIERS);
 *  5. MANPOWER: WAYSTATION_MANPOWER_GRANT, allowed to overflow the cap.
 * No-op if the tile has no waystation or it was already activated (one-time
 * only, never re-fires). The consumed record travels with the tile for event
 * replay and live reward notifications. Clients
 * clear the map feature when they receive an activated record.
 */
export const activateWaystationAt = (
  input: WaystationActivationInput,
  targetKey: string,
  x: number,
  y: number,
  playerId: string,
  commandId: string,
  automatic = false
): void => {
  const tile = input.tiles.get(targetKey);
  if (!tile?.waystation || tile.waystation.activated) return;
  // Resolve the player BEFORE any mutation: this activation is a strict
  // one-shot (the `activated` guard above never lets it retry), so if the
  // player record is somehow missing at this call site we must bail out
  // without flipping the tile or granting anything -- otherwise the
  // waystation would burn its one activation with no effect applied at all,
  // permanently.
  const player = input.players.get(playerId);
  if (!player || (automatic && !player.isAi)) return;

  const random = input.random ?? Math.random;
  const effectIndex = Math.floor(random() * WAYSTATION_EFFECTS.length) % WAYSTATION_EFFECTS.length;
  const rolledEffect = WAYSTATION_EFFECTS[effectIndex] ?? "VISION";

  // One timestamp for the tile stamp and the eventLog/Chronicle entry below.
  const occurredAt = input.now();
  const waystationResult: NonNullable<DomainTileState["waystation"]> = { activated: true, activatedByPlayerId: playerId, activatedAt: occurredAt, grantedEffect: rolledEffect };
  let populationBurst: number | undefined;
  let resource: ResourceType | undefined;

  // Resolve the chosen effect's grant (and its wire-visible detail field, if
  // any) BEFORE writing the waystation tile itself, so the single tile delta
  // emitted below already carries the full, final result -- no second write
  // or re-emit needed.
  if (rolledEffect === "VISION") {
    // A one-time look that expires (see grantWaystationVision), never a permanent footprint.
    const { revealedAtX, revealedAtY } = grantWaystationVision(input, playerId, targetKey, x, y);
    waystationResult.revealedAtX = revealedAtX;
    waystationResult.revealedAtY = revealedAtY;
  } else if (rolledEffect === "TECH") {
    const grantedTechId = grantWaystationTech(input, player, playerId, commandId, random);
    if (grantedTechId) {
      waystationResult.grantedTechId = grantedTechId;
    } else {
      // Every tier-1 tech already owned: pay out gold instead of burning the
      // one-shot activation on nothing. Recorded as GOLD so the tile, event
      // log and popup all describe what the player actually received.
      grantGoldInto(waystationResult, player, random);
    }
  } else if (rolledEffect === "RESOURCE_TILE") {
    const grantedResource = lowestBalanceWaystationResource(player);
    waystationResult.grantedResource = grantedResource;
    resource = WAYSTATION_TILE_RESOURCES[grantedResource];
  } else if (rolledEffect === "GOLD") {
    grantGoldInto(waystationResult, player, random);
  } else if (rolledEffect === "MANPOWER") {
    waystationResult.grantedManpower = grantWaystationManpower(player, input);
  } else if (rolledEffect === "POPULATION") {
    const grantedTown = grantWaystationPopulationBurst(input, playerId, x, y, commandId);
    if (grantedTown) {
      if (grantedTown.name) waystationResult.grantedTownName = grantedTown.name;
      waystationResult.grantedTownX = grantedTown.x;
      waystationResult.grantedTownY = grantedTown.y;
      populationBurst = grantedTown.populationBurst;
    } else {
      // No owned town to receive settlers: pay out GOLD instead (same
      // fallback as an exhausted TECH roll) so the tile, event log and popup
      // describe what the player actually got -- not a population burst that
      // never landed.
      grantGoldInto(waystationResult, player, random);
    }
  }

  const updated: DomainTileState = { ...tile, ...(resource ? { resource } : {}), waystation: waystationResult };
  input.replaceTileState(targetKey, updated, commandId);
  input.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [input.tileDeltaFromState(updated)] });

  // Durable "what happened while I was away" record (see
  // packages/game-domain/src/index/player-event-log.ts) -- activation can
  // happen with no one connected (auto-settle/lock-resolution), and the
  // TILE_DELTA_BATCH just emitted only reaches an already-subscribed client.
  // This is what lets the client show the activation popup on the player's
  // *next* connection, from any device, instead of only live.
  const effect = waystationResult.grantedEffect ?? rolledEffect;
  const detailFields = waystationResultDetailFields(waystationResult);
  appendPlayerEventLogEntry(player, {
    type: "WAYSTATION_ACTIVATED",
    text: waystationActivationLogText(effect),
    occurredAt,
    x,
    y,
    grantedEffect: effect,
    ...detailFields
  });
  input.recordPersonalImpact?.({
    id: `waystation:${playerId}:${targetKey}`,
    kind: "WAYSTATION_ACTIVATED",
    playerId,
    occurredAt,
    x,
    y,
    grantedEffect: effect,
    ...detailFields,
    ...(populationBurst ? { populationBurst } : {})
  });
};

/** Grants the GOLD effect and records it on the activation result (also used as the TECH-exhausted fallback). */
const grantGoldInto = (result: NonNullable<DomainTileState["waystation"]>, player: DomainPlayer, random: () => number): void => {
  const gold = grantWaystationGold(player, random);
  result.grantedEffect = "GOLD";
  result.grantedGold = gold.amount;
  result.grantedGoldTier = gold.tier;
};

/** Short server-side flavor line for the Activity Feed fallback -- the client's activation popup (client-waystation-activation.ts) has its own richer per-effect copy built from the structured fields above; this text is only what's shown if the popup itself doesn't fire (e.g. an older client that doesn't know the effect). */
const waystationActivationLogText = (effect: WaystationEffect): string => {
  if (effect === "VISION") return "A captured waystation revealed a nearby area.";
  if (effect === "POPULATION") return "A captured waystation sent settlers to one of your towns.";
  if (effect === "TECH") return "A captured waystation shared research with your empire.";
  if (effect === "GOLD") return "A captured waystation handed its coffers to your treasury.";
  if (effect === "MANPOWER") return "A captured waystation sent militia to join your ranks.";
  return "A captured waystation uncovered a resource site.";
};
