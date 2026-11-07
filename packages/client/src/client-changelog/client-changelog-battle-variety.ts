import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BATTLE_VARIETY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.07",
  title: "Battles move differently from the start",
  changes: ["Four full battle animations use a straight approach and distinct exchanges of fire. Assaults suppress defenders early; contested firefights trade losses across both sides throughout the exchange. Last stands and comebacks leave a lone attacker by the midpoint; comebacks pick off opponents through the second half.", "Rare upset victories can end with one soldier holding out, defeating the remaining opponents and advancing alone. Fallen squad members stay down.", "The 2D map shows matching squad markers and exchanges of fire. Combat odds, manpower losses and attack timing are unchanged."],
  why: "Make a hard-fought victory feel different from an easy capture."
};
