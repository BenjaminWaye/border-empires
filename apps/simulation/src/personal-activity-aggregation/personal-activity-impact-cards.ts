import type {
  PersonalActivityBuildingCard,
  PersonalActivityTownCard,
  PersonalActivityWaystationCard
} from "@border-empires/game-domain";

import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";

export type PersonalImpactCards = {
  waystations: PersonalActivityWaystationCard[];
  towns: PersonalActivityTownCard[];
  buildings: PersonalActivityBuildingCard[];
};

export const personalImpactCardsForPlayer = (playerId: string, events: readonly PersonalImpactEvent[]): PersonalImpactCards => {
  const cards: PersonalImpactCards = { waystations: [], towns: [], buildings: [] };
  for (const event of events) {
    if (event.playerId !== playerId) continue;
    if (event.kind === "WAYSTATION_ACTIVATED") {
      cards.waystations.push({ ...event });
    } else if (event.kind === "TOWN_CAPTURED" || event.kind === "TOWN_LOST") {
      cards.towns.push({ ...event });
    } else if (event.kind === "BUILDING_COMPLETED") {
      cards.buildings.push({ ...event });
    }
  }
  return cards;
};
