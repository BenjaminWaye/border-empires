import type { PersonalActivityDiplomacyCard } from "@border-empires/game-domain";
import type { PlayerNameLookup } from "./client-activity-dashboard-names.js";
import { relativeDayTimeLabel } from "./client-activity-dashboard-time.js";
import type { FealtyStanding } from "../client-fealty/client-fealty.js";

// " · ends Sun 00:45": a truce row's end as of that row, so an extension visibly moves it.
const endsPart = (card: PersonalActivityDiplomacyCard, nowMs: number): string =>
  typeof card.endsAt === "number" ? ` · ends ${relativeDayTimeLabel(card.endsAt, nowMs)}` : "";

// An alliance row between unequal empires reads as fealty (client-fealty.ts).
// The card records no sizes, so `standing` is today's: the same sizes the
// victory check reads. A broken alliance stays plain "Alliance ... ended".
const fealtyCardText = (card: PersonalActivityDiplomacyCard, playerId: string, other: string, standing: FealtyStanding): string | undefined => {
  if (standing === "ALLIANCE") return undefined;
  const swear = standing === "SWEAR";
  const byMe = card.byPlayerId === playerId;
  switch (card.event) {
    case "ALLIANCE_OFFERED":
      if (byMe) return swear ? `You offered ${other} your fealty` : `You demanded ${other}'s fealty`;
      return swear ? `${other} demanded your fealty` : `${other} offered you fealty`;
    case "ALLIANCE_DECLINED":
      if (byMe) return swear ? `You refused to swear fealty to ${other}` : `You refused ${other}'s fealty`;
      return swear ? `${other} refused your fealty` : `${other} refused to swear fealty`;
    case "ALLIANCE_FORMED":
      return swear ? `You swore fealty to ${other}` : `${other} swore fealty to you`;
    default:
      return undefined;
  }
};

// Timeline text for the gateway's truce/alliance rows. The live roster name
// wins (a renamed player reads correctly); the card's own name is the
// fallback for someone this client never saw.
export const diplomacyCardText = (card: PersonalActivityDiplomacyCard, playerId: string, playerNames: PlayerNameLookup, nowMs: number = Date.now(), fealtyWith?: (playerId: string) => FealtyStanding): string => {
  const other = playerNames(card.counterpartyPlayerId) ?? card.counterpartyName;
  const fealty = fealtyWith ? fealtyCardText(card, playerId, other, fealtyWith(card.counterpartyPlayerId)) : undefined;
  if (fealty) return fealty;
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
