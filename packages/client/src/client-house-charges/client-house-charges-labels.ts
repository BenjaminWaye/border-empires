// Player-facing words for House Charges (docs/house-charges-plan.md), shared
// by the Charges panel and, later, the season-end reveal and cards.
import {
  HOUSE_CHARGE_METROPOLIS_COUNT,
  HOUSE_CHARGE_REGION_GARRISON_SHARE,
  houseStyledName,
  type HouseChargeKind,
  type HouseChargeRarity,
  type HouseChargeView
} from "@border-empires/shared";

export const HOUSE_CHARGE_KIND_LABEL: Readonly<Record<HouseChargeKind, string>> = {
  CHARTER: "Charter of Passage",
  SEAT: "Founding of a Seat",
  SURVEY: "Survey Claim",
  DESERT: "Garrison the Desert",
  TUNDRA: "Garrison the Tundra",
  RELIC: "Reawakening",
  CORRECTION: "Writ of Correction",
  METROPOLIS: "Founding of the Three Seats"
};

export const HOUSE_CHARGE_RARITY_LABEL: Readonly<Record<HouseChargeRarity, string>> = {
  COMMON: "Common",
  RARE: "Rare",
  MYTHIC: "Mythic"
};

const TIER_LABEL: Readonly<Record<string, string>> = {
  SETTLEMENT: "Settlement",
  TOWN: "Town",
  CITY: "City",
  GREAT_CITY: "Great City",
  METROPOLIS: "Metropolis"
};
const TIER_BY_SIZE = ["", "Settlement", "Town", "City", "Great City", "Metropolis"];

/** What the House must do, in one sentence. */
export const houseChargeObjective = (charge: HouseChargeView): string => {
  const [first, second] = charge.targets;
  switch (charge.kind) {
    case "CHARTER":
      return `Join ${first?.name ?? "the first town"} and ${second?.name ?? "the second town"} with an unbroken road of garrisoned land, both towns at Town tier or above.${charge.crossWater ? " They are on different landmasses: the road crosses the sea through a dock you garrison on each side." : ""}`;
    case "SEAT":
      return `Hold ${first?.name ?? "the town"} and grow it to a City.`;
    case "SURVEY":
      return `Garrison all of ${first?.name ?? "the landmass"} and keep your House's name in the charts.`;
    case "DESERT":
    case "TUNDRA":
      return `Garrison ${Math.round(HOUSE_CHARGE_REGION_GARRISON_SHARE * 100)}% of ${first?.name ?? "the region"}.`;
    case "RELIC":
      return first ? "Garrison the Concordance installation." : "Find the Concordance installation's beacon in the marked area, then garrison it.";
    case "CORRECTION":
      return `Capture an AFC founded by ${houseStyledName(first?.name ?? "the rival")} and hold it to the end of the contest.`;
    case "METROPOLIS":
      return `Hold ${HOUSE_CHARGE_METROPOLIS_COUNT} towns on ${first?.name ?? "the landmass"} and grow each one to a Metropolis.`;
  }
};

/** Why a rival House is named in a Writ of Correction: one offence per charge, fixed by its id. */
export const CORRECTION_OFFENCES: readonly string[] = [
  "sold our landing charts before the last Proclamation's feast was cleared",
  "turned our envoys away at the gate and named it caution",
  "struck our House's name from a chart we paid to survey",
  "took a convoy under our seal and called it salvage"
];

const hash = (text: string): number => {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
};

/** The House's sealed letter behind a charge, or undefined for charges whose objective says it all. */
export const houseChargeLetter = (charge: Pick<HouseChargeView, "id" | "kind" | "targets">): string | undefined => {
  const name = charge.targets[0]?.name;
  switch (charge.kind) {
    case "CORRECTION": {
      const house = houseStyledName(name ?? "the rival");
      const offence = CORRECTION_OFFENCES[hash(charge.id) % CORRECTION_OFFENCES.length]!;
      return `${house} ${offence}. The elders have lodged the grievance with the Court's heralds. It is yours to press: take an AFC they founded and hold it until the campaign is decided, so the Core sees the wrong answered.`;
    }
    case "METROPOLIS":
      return `The elders want three cadet lines seated on ${name ?? "the landmass"}, each in a city great enough to carry the House's name. Take the towns early, feed them, and keep the fighting away from their walls.`;
    default:
      return undefined;
  }
};

/** Current progress, or undefined when there is nothing to count yet. */
export const houseChargeProgress = (charge: HouseChargeView): string | undefined => {
  if (!charge.kept) return undefined;
  switch (charge.kind) {
    case "CHARTER":
      return charge.held ? `Road complete: ${charge.size} tiles` : "No unbroken road yet";
    case "SEAT":
      return charge.size > 0 ? `Now a ${TIER_BY_SIZE[charge.size] ?? "town"} (started as a ${TIER_LABEL[charge.startTier ?? ""] ?? "town"})` : "Not held";
    case "SURVEY":
      return `${charge.size} of ${charge.areaTiles ?? "?"} land tiles garrisoned`;
    case "DESERT":
    case "TUNDRA": {
      const needed = charge.areaTiles ? Math.ceil(charge.areaTiles * HOUSE_CHARGE_REGION_GARRISON_SHARE) : undefined;
      return `${charge.size} of ${needed ?? "?"} tiles garrisoned`;
    }
    case "RELIC":
      return charge.held ? "Garrisoned" : charge.targets.length > 0 ? "Beacon found" : "Beacon not found yet";
    case "CORRECTION": {
      const house = houseStyledName(charge.targets[0]?.name ?? "the rival");
      return charge.held ? `${house}'s AFC taken` : charge.lostAt !== undefined ? `${house} has retaken its AFC` : `${house}'s AFC: not taken`;
    }
    case "METROPOLIS":
      return `${charge.size} of ${HOUSE_CHARGE_METROPOLIS_COUNT} Metropolises held`;
  }
};
