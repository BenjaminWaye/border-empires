import type { PersonalActivityCard } from "@border-empires/game-domain";

// How a timeline row went for the viewing player, so the list can be scanned
// by colour and glyph before reading: ground gained, ground or manpower lost,
// an attack held off, or something neutral (buildings, waystations, notes).
export type ActivityCardTone = "gain" | "loss" | "hold" | "neutral";

export const ACTIVITY_TONE_GLYPH: Record<ActivityCardTone, string> = { gain: "▲", loss: "▼", hold: "◆", neutral: "•" };

export const activityCardTone = (card: PersonalActivityCard, playerId: string): ActivityCardTone => {
  switch (card.kind) {
    case "TERRITORY_FLIP_GROUP":
      return card.direction === "GAINED" ? "gain" : "loss";
    case "COMBAT":
      if (card.attackerId === playerId) return card.attackerWon ? "gain" : "loss";
      return card.attackerWon ? "loss" : "hold";
    case "COMBAT_GROUP":
      if (card.role === "ATTACKER") return card.captures > 0 ? "gain" : "loss";
      return card.captures > 0 ? "loss" : "hold";
    case "SIEGE":
      return card.outcome === "FELL" ? "loss" : "hold";
    case "TOWN_CAPTURED":
      return "gain";
    case "TOWN_LOST":
      return "loss";
    default:
      return "neutral";
  }
};
