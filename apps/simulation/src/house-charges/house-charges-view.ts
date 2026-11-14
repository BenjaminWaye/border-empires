// The HOUSE_CHARGES push: a House's own charges as it may see them
// (docs/house-charges-plan.md, "Progressive reveal"). Town, island and region
// targets are named places the House can find on its own map, so their
// positions are sent and the client limits exact highlights to explored
// ground. A relic charge keeps the relic rules intact: no position until the
// House detects the relic's beacon (a garrison within RELIC_RULES.signalRadius,
// as runtime-relic-map-hints.ts), and no installation type until the House
// garrisons the site itself.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  HOUSE_CHARGES_CHOICE_WINDOW_MS,
  HOUSE_CHARGES_MESSAGE_TYPE,
  RELIC_RULES,
  houseChargeTitle,
  wrapX,
  wrapY,
  type HouseCharge,
  type HouseChargeView,
  type HouseChargesPayload
} from "@border-empires/shared";
import { houseChargesWorldFor, type HouseChargesWorld } from "./house-charges-world.js";

const isGarrisonedBy = (tile: DomainTileState | undefined, playerId: string): boolean =>
  Boolean(tile && tile.ownerId === playerId && tile.ownershipState === "SETTLED");

/** Whether `playerId` garrisons a tile within the relic beacon's signal radius of `site`. */
export const detectsRelicBeacon = (
  tiles: ReadonlyMap<string, DomainTileState>,
  world: Pick<HouseChargesWorld, "width" | "height">,
  playerId: string,
  site: { x: number; y: number }
): boolean => {
  const radius = RELIC_RULES.signalRadius;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > radius) continue;
      if (isGarrisonedBy(tiles.get(`${wrapX(site.x + dx, world.width)},${wrapY(site.y + dy, world.height)}`), playerId)) return true;
    }
  }
  return false;
};

const targetTileKey = (targetKey: string): string => targetKey.slice(targetKey.indexOf(":") + 1);

/** The tiles of a landmass or biome region target, as "x,y" keys; undefined for point targets. */
const areaTileKeysFor = (charge: HouseCharge, world: HouseChargesWorld): string[] | undefined => {
  const target = charge.targets[0];
  if (!target) return undefined;
  const area = charge.kind === "SURVEY"
    ? world.islands.byId.get(targetTileKey(target.key))
    : charge.kind === "DESERT" || charge.kind === "TUNDRA"
      ? world.regions.byId.get(targetTileKey(target.key))
      : undefined;
  if (!area) return undefined;
  return Array.from(area.cells, (cell) => `${cell % world.width},${Math.floor(cell / world.width)}`);
};

const chargeView = (
  charge: HouseCharge,
  player: DomainPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  world: HouseChargesWorld
): HouseChargeView => {
  const state = player.houseCharges!;
  const kept = state.keptIds.includes(charge.id);
  const completeSince = kept ? state.completeSince?.[charge.id] : undefined;
  const base = {
    id: charge.id,
    kind: charge.kind,
    title: houseChargeTitle(charge),
    rarity: charge.rarity,
    renown: charge.renown,
    kept,
    held: completeSince !== undefined,
    ...(completeSince !== undefined ? { completeSince } : {}),
    size: kept ? state.sizes?.[charge.id] ?? 0 : 0,
    searchCircle: { ...charge.searchCircle },
    ...(charge.startTier ? { startTier: charge.startTier } : {}),
    ...(charge.areaTiles !== undefined ? { areaTiles: charge.areaTiles } : {})
  };
  if (charge.kind !== "RELIC") {
    const areaTileKeys = areaTileKeysFor(charge, world);
    return { ...base, targets: charge.targets.map((target) => ({ ...target })), ...(areaTileKeys ? { areaTileKeys } : {}) };
  }
  const site = charge.targets[0];
  if (!site) return { ...base, targets: [] };
  const siteKey = `${site.x},${site.y}`;
  const detected = detectsRelicBeacon(tiles, world, player.id, site);
  return {
    ...base,
    targets: detected ? [{ ...site }] : [],
    ...(charge.relicType && isGarrisonedBy(tiles.get(siteKey), player.id) ? { relicType: charge.relicType } : {})
  };
};

/** The HOUSE_CHARGES payload for `player`, or undefined before its charges are dealt. */
export const houseChargesPayloadFor = (player: DomainPlayer, tiles: ReadonlyMap<string, DomainTileState>): HouseChargesPayload | undefined => {
  const state = player.houseCharges;
  if (!state) return undefined;
  const world = houseChargesWorldFor(tiles);
  return {
    type: HOUSE_CHARGES_MESSAGE_TYPE,
    dealtAt: state.dealtAt,
    choiceClosesAt: state.dealtAt + HOUSE_CHARGES_CHOICE_WINDOW_MS,
    charges: state.offered.map((charge) => chargeView(charge, player, tiles, world))
  };
};
