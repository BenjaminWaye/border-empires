import type {
  PersonalActivityBuildingCard,
  PersonalActivityDockCard,
  PersonalActivityScoutReportCard,
  PersonalActivityScoutSightedCard,
  PersonalActivitySupplyEndedCard,
  PersonalActivityTownCard,
  PersonalActivityWaystationCard
} from "@border-empires/game-domain";

import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";

export type PersonalImpactCards = {
  waystations: PersonalActivityWaystationCard[];
  towns: PersonalActivityTownCard[];
  docks: PersonalActivityDockCard[];
  buildings: PersonalActivityBuildingCard[];
  scouting: Array<PersonalActivityScoutReportCard | PersonalActivityScoutSightedCard>;
  supplies: PersonalActivitySupplyEndedCard[];
};

export const personalImpactCardsForPlayer = (playerId: string, events: readonly PersonalImpactEvent[]): PersonalImpactCards => {
  const cards: PersonalImpactCards = { waystations: [], towns: [], docks: [], buildings: [], scouting: [], supplies: [] };
  for (const event of events) {
    if (event.playerId !== playerId) continue;
    if (event.kind === "WAYSTATION_ACTIVATED") {
      cards.waystations.push({ ...event });
    } else if (event.kind === "TOWN_CAPTURED" || event.kind === "TOWN_LOST") {
      cards.towns.push({ ...event });
    } else if (event.kind === "DOCK_CAPTURED" || event.kind === "DOCK_LOST") {
      cards.docks.push({ ...event });
    } else if (event.kind === "BUILDING_COMPLETED") {
      cards.buildings.push({ ...event });
    } else if (event.kind === "SCOUT_REPORT") {
      cards.scouting.push({ ...event, empiresSighted: [...event.empiresSighted] });
    } else if (event.kind === "SCOUT_SIGHTED") {
      cards.scouting.push({ ...event });
    } else if (event.kind === "SUPPLY_ENDED") {
      cards.supplies.push({ ...event, youGave: { ...event.youGave }, youGot: { ...event.youGot } });
    }
  }
  return cards;
};
