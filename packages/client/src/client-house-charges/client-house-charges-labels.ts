// Player-facing words for House Charges (docs/house-charges-plan.md), shared
// by the Charges panel and, later, the season-end reveal and cards.
import { HOUSE_CHARGE_REGION_GARRISON_SHARE, type HouseChargeKind, type HouseChargeRarity, type HouseChargeView } from "@border-empires/shared";

export const HOUSE_CHARGE_KIND_LABEL: Readonly<Record<HouseChargeKind, string>> = {
  CHARTER: "Charter of Passage",
  SEAT: "Founding of a Seat",
  SURVEY: "Survey Claim",
  DESERT: "Garrison the Desert",
  TUNDRA: "Garrison the Tundra",
  RELIC: "Reawakening"
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
  }
};
