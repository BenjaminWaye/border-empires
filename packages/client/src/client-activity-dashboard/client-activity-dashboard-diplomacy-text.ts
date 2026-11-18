import type { PersonalActivityDiplomacyCard } from "@border-empires/game-domain";
import type { PlayerNameLookup } from "./client-activity-dashboard-names.js";
import { relativeDayTimeLabel } from "./client-activity-dashboard-time.js";

// " · ends Sun 00:45": a truce row's end as of that row, so an extension visibly moves it.
const endsPart = (card: PersonalActivityDiplomacyCard, nowMs: number): string =>
  typeof card.endsAt === "number" ? ` · ends ${relativeDayTimeLabel(card.endsAt, nowMs)}` : "";

// Timeline text for the gateway's truce/alliance rows. The live roster name
// wins (a renamed player reads correctly); the card's own name is the
// fallback for someone this client never saw.
export const diplomacyCardText = (card: PersonalActivityDiplomacyCard, playerId: string, playerNames: PlayerNameLookup, nowMs: number = Date.now()): string => {
  const other = playerNames(card.counterpartyPlayerId) ?? card.counterpartyName;
  switch (card.event) {
    case "TRUCE_OFFERED":
      return `${other} offered you a truce${card.durationHours ? ` · ${card.durationHours}h` : ""}`;
    case "TRUCE_STARTED":
      if (card.court) return `Court armistice with ${other} began${card.durationHours ? ` · ${card.durationHours}h` : ""}${endsPart(card, nowMs)}`;
      return `Truce with ${other} began${card.durationHours ? ` · ${card.durationHours}h` : ""}${endsPart(card, nowMs)}`;
    case "TRUCE_EXTENDED":
      return `Truce with ${other} extended${card.durationHours ? ` by ${card.durationHours}h` : ""}${endsPart(card, nowMs)}`;
    case "TRUCE_ENDED":
      return `Truce with ${other} ended`;
    case "TRUCE_BROKEN":
      return card.byPlayerId === playerId ? `You broke the truce with ${other}` : `${other} broke your truce`;
    case "ALLIANCE_OFFERED":
      return card.byPlayerId === playerId ? `You offered ${other} an alliance` : `${other} offered you an alliance`;
    case "ALLIANCE_DECLINED":
      return card.byPlayerId === playerId ? `You declined ${other}'s alliance offer` : `${other} declined your alliance offer`;
    case "ALLIANCE_FORMED":
      return `Alliance with ${other} formed`;
    case "ALLIANCE_BROKEN":
      return `Alliance with ${other} ended`;
    default:
      return `Diplomacy with ${other} changed`;
  }
};
