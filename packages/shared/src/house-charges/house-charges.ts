// House Charges (docs/house-charges-plan.md): secret, map-named objectives a
// House is dealt when it lands. A charge only counts if it is complete and
// still held at the moment the season's winner is crowned. Shared by the
// simulation (authority: dealing, held state, crowning results), the gateway
// and the client.

export type HouseChargeKind = "CHARTER" | "SEAT" | "SURVEY" | "DESERT" | "TUNDRA" | "RELIC";

/** Card rarity (docs/house-charges-plan.md "Card design"). */
export type HouseChargeRarity = "COMMON" | "RARE" | "MYTHIC";

export const HOUSE_CHARGE_KINDS: readonly HouseChargeKind[] = ["CHARTER", "SEAT", "SURVEY", "DESERT", "TUNDRA", "RELIC"];

/** Charges offered at landing, and how many of them the House keeps. */
export const HOUSE_CHARGES_OFFERED = 3;
export const HOUSE_CHARGES_KEPT = 2;
/** How long after the deal the House may change which charges it keeps. */
export const HOUSE_CHARGES_CHOICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** At most this many Houses may be dealt the same town; other targets allow HOUSE_CHARGE_TARGET_CAP. */
export const HOUSE_CHARGE_TOWN_CAP = 5;
export const HOUSE_CHARGE_TARGET_CAP = 3;

// Distance bands from the House's landing site, in tiles (wrapped Manhattan
// distance). Validated by the 2026-11-12 simulation on real season worldgen.
export const HOUSE_CHARGE_CHARTER_TOWN_MIN_DISTANCE = 8;
export const HOUSE_CHARGE_CHARTER_TOWN_MAX_DISTANCE = 50;
export const HOUSE_CHARGE_CHARTER_PAIR_MIN_DISTANCE = 12;
export const HOUSE_CHARGE_CHARTER_PAIR_MAX_DISTANCE = 35;
export const HOUSE_CHARGE_SEAT_MIN_DISTANCE = 6;
export const HOUSE_CHARGE_SEAT_MAX_DISTANCE = 45;
export const HOUSE_CHARGE_REGION_MAX_DISTANCE = 35;
export const HOUSE_CHARGE_RELIC_MAX_DISTANCE = 45;

/** Survey Claim: landmasses with this many LAND tiles are eligible. */
export const HOUSE_CHARGE_SURVEY_MIN_LAND_TILES = 25;
export const HOUSE_CHARGE_SURVEY_MAX_LAND_TILES = 600;
/** Desert/tundra regions: connected biome tiles in this size band are named and eligible. */
export const HOUSE_CHARGE_REGION_MIN_TILES = 30;
export const HOUSE_CHARGE_REGION_MAX_TILES = 400;
/** Share of a desert/tundra region's LAND tiles that must be garrisoned. */
export const HOUSE_CHARGE_REGION_GARRISON_SHARE = 0.75;

/** Search-circle radius shown before the target has been seen (progressive reveal). */
export const HOUSE_CHARGE_SEARCH_RADIUS = 9;

export type HouseChargePoint = { x: number; y: number };

/** A named place a charge points at. `key` is the stable target id used for holder caps. */
export type HouseChargeTarget = HouseChargePoint & { key: string; name: string };

export type HouseCharge = {
  /** Unique per player: `${kind}:${target keys}`. */
  id: string;
  kind: HouseChargeKind;
  /** The charge's place name(s), e.g. two towns for a Charter, one region otherwise. */
  targets: HouseChargeTarget[];
  /** Approximate area shown until the target is seen. */
  searchCircle: HouseChargePoint & { radius: number };
  rarity: HouseChargeRarity;
  /** Renown value, 1..4, shown as pips on the card. */
  renown: number;
  /** SEAT only: the town's tier when the charge was dealt. */
  startTier?: string;
  /** RELIC only: installation family, hidden from the House until it is discovered normally. */
  relicType?: string;
  /** DESERT/TUNDRA/SURVEY: LAND tiles in the target when dealt. */
  areaTiles?: number;
};

/** A House's charges, stored on its player record. */
export type HouseChargesState = {
  dealtAt: number;
  /** The offered charges (HOUSE_CHARGES_OFFERED, fewer when the map had too few targets). */
  offered: HouseCharge[];
  /** Ids of the kept charges (subset of `offered`). */
  keptIds: string[];
  /** Kept charge id -> epoch ms it last became complete; absent while not complete. */
  completeSince?: Record<string, number>;
  /** Kept charge id -> kind-specific size at the last evaluation (see HouseChargeResult.size). */
  sizes?: Record<string, number>;
  /** Kept charge id -> epoch ms it stopped being complete; cleared once it is complete again. Drives the private loss warning. */
  lostAt?: Record<string, number>;
  /** Kept charge id -> card art (house-charge-art.ts) of what was last held complete: the road, or the area. */
  art?: Record<string, string>;
};

/** One kept charge's outcome, recorded when the winner is crowned. */
export type HouseChargeResult = {
  id: string;
  kind: HouseChargeKind;
  title: string;
  rarity: HouseChargeRarity;
  renown: number;
  held: boolean;
  /** Whole hours the charge had been continuously complete at the crowning; 0 when not held. */
  hoursHeld: number;
  /** Kind-specific size: road length, town tier index, tiles garrisoned, or 1 for a relic. */
  size: number;
  /** Place names the charge pointed at (towns, region or landmass); absent for an unrevealed relic. */
  places?: string[];
  /** Card art bitmap (house-charge-art.ts) of the held road or area, when held. */
  art?: string;
  /** RELIC: installation family, recorded once the House held it. */
  relicType?: string;
};

/** Every House's kept charges and their outcome, recorded on the season at crowning. */
export type SeasonHouseChargesSnapshot = {
  playerId: string;
  playerName: string;
  charges: HouseChargeResult[];
};

/** Human-readable title of a charge, e.g. "Road of Vell and Harrowmere". */
export const houseChargeTitle = (charge: Pick<HouseCharge, "kind" | "targets">): string => {
  const [first, second] = charge.targets;
  const name = first?.name ?? "Unknown";
  switch (charge.kind) {
    case "CHARTER":
      return `Road of ${name} and ${second?.name ?? "Unknown"}`;
    case "SEAT":
      return `Seat of ${name}`;
    case "RELIC":
      return "A Concordance installation";
    default:
      return name;
  }
};

/** The kept charges, in kept order. */
export const keptHouseCharges = (state: Pick<HouseChargesState, "offered" | "keptIds">): HouseCharge[] =>
  state.keptIds.map((id) => state.offered.find((charge) => charge.id === id)).filter((charge): charge is HouseCharge => Boolean(charge));

export const HOUSE_CHARGES_MESSAGE_TYPE = "HOUSE_CHARGES";

/**
 * One charge as its own House sees it. Progressive reveal is applied by the
 * simulation: a relic charge carries no target position until the House
 * detects the relic's beacon, and never its installation type until the
 * House garrisons it.
 */
export type HouseChargeView = {
  id: string;
  kind: HouseChargeKind;
  title: string;
  rarity: HouseChargeRarity;
  renown: number;
  kept: boolean;
  /** Complete right now. */
  held: boolean;
  /** Epoch ms it last became complete, while held. */
  completeSince?: number;
  /** Kind-specific size now (see HouseChargeResult.size). */
  size: number;
  /** While not held: epoch ms the House lost it (it had been complete before). */
  lostAt?: number;
  searchCircle: HouseCharge["searchCircle"];
  targets: HouseChargeTarget[];
  startTier?: string;
  relicType?: string;
  areaTiles?: number;
  /** SURVEY/DESERT/TUNDRA: the target area's tile keys ("x,y"), for the map highlight; the client shows only explored ones. */
  areaTileKeys?: string[];
};

/** Pushed to a House when its charges are dealt or change, and on connect. */
export type HouseChargesPayload = {
  type: typeof HOUSE_CHARGES_MESSAGE_TYPE;
  dealtAt: number;
  /** Epoch ms after which the kept charges can no longer be changed. */
  choiceClosesAt: number;
  charges: HouseChargeView[];
};

/** Why a CHOOSE_HOUSE_CHARGES choice is refused, or undefined when it is valid. */
export const houseChargeChoiceError = (
  state: Pick<HouseChargesState, "dealtAt" | "offered">,
  keptIds: readonly string[],
  nowMs: number
): string | undefined => {
  if (nowMs > state.dealtAt + HOUSE_CHARGES_CHOICE_WINDOW_MS) return "the choice closed a day after your charges were dealt";
  const wanted = Math.min(HOUSE_CHARGES_KEPT, state.offered.length);
  if (keptIds.length !== wanted || new Set(keptIds).size !== keptIds.length) return `keep exactly ${wanted} different charges`;
  if (!keptIds.every((id) => state.offered.some((charge) => charge.id === id))) return "keep only charges you were offered";
  return undefined;
};
