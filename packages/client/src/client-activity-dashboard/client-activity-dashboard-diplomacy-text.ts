import type { PersonalActivityDiplomacyCard } from "@border-empires/game-domain";
import type { PlayerNameLookup } from "./client-activity-dashboard-names.js";

// Timeline text for the gateway's truce/alliance rows. The live roster name
// wins (a renamed player reads correctly); the card's own name is the
// fallback for someone this client never saw.
export const diplomacyCardText = (card: PersonalActivityDiplomacyCard, playerId: string, playerNames: PlayerNameLookup): string => {
  const other = playerNames(card.counterpartyPlayerId) ?? card.counterpartyName;
  switch (card.event) {
    case "TRUCE_STARTED":
      if (card.court) return `Court armistice with ${other} began${card.durationHours ? ` · ${card.durationHours}h` : ""}`;
      return `Truce with ${other} began${card.durationHours ? ` · ${card.durationHours}h` : ""}`;
    case "TRUCE_ENDED":
      return `Truce with ${other} ended`;
    case "TRUCE_BROKEN":
      return card.byPlayerId === playerId ? `You broke the truce with ${other}` : `${other} broke your truce`;
    case "ALLIANCE_FORMED":
      return `Alliance with ${other} formed`;
    case "ALLIANCE_BROKEN":
      return `Alliance with ${other} ended`;
    default:
      return `Diplomacy with ${other} changed`;
  }
};
