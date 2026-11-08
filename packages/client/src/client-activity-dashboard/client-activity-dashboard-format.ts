import type { PersonalActivityCard } from "@border-empires/game-domain";
import { PLANETARY_DEFENSE_DISPLAY_NAME, structureDisplayName } from "@border-empires/shared";
import { isPlanetaryDefenseOwnerId } from "../client-planetary-defense-style.js";
import type { ClientState } from "../client-state/client-state.js";
import { combatCardText, combatGroupCardText, siegeCardText } from "./client-activity-dashboard-combat-text.js";
import { featuresPart } from "./client-activity-dashboard-features.js";
import { diplomacyCardText } from "./client-activity-dashboard-diplomacy-text.js";
import { nameOf, roundedAmount, type PlayerNameLookup } from "./client-activity-dashboard-names.js";

export type { PlayerNameLookup };

const timeLabel = (occurredAt: number): string => {
  const date = new Date(occurredAt);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

// An AI player's ClientState.playerNames entry is its diplomacy name (see
// client-owner-name.ts), so AI display names come from the leaderboard's live
// name, which is what the rest of the UI shows for them. Everyone else keeps resolving through
// playerNames, which a PLAYER_STYLE rename updates immediately while the
// leaderboard lags until the next status update. Build once per render.
export const activityPlayerNameLookup = (state: Pick<ClientState, "playerNames" | "leaderboard">): PlayerNameLookup => {
  const aiNames = new Map<string, string>();
  const { overall, byTiles, byIncome, byTechs } = state.leaderboard;
  for (const entry of [...overall, ...byTiles, ...byIncome, ...byTechs]) {
    if (entry.id.startsWith("ai-") && !aiNames.has(entry.id)) aiNames.set(entry.id, entry.name);
  }
  // Barbarians are Planetary Defense everywhere else in the UI; without this a
  // siege lost to them read "fell to barbarian-1".
  return (playerId) => (isPlanetaryDefenseOwnerId(playerId) ? PLANETARY_DEFENSE_DISPLAY_NAME : aiNames.get(playerId) ?? state.playerNames.get(playerId));
};

// Resolves a tech id to its player-facing name (ClientState.techCatalog);
// an unknown id falls back to the raw id.
export type TechNameLookup = (techId: string) => string | undefined;

const territoryCardText = (card: Extract<PersonalActivityCard, { kind: "TERRITORY_FLIP_GROUP" }>, playerNames: PlayerNameLookup): string => {
  const counterparty = card.counterpartyPlayerId ? ` (${nameOf(card.counterpartyPlayerId, playerNames)})` : "";
  const text = card.direction === "GAINED"
    ? `+${card.tileCount} tile${card.tileCount === 1 ? "" : "s"} claimed${counterparty}`
    : `−${card.tileCount} tile${card.tileCount === 1 ? "" : "s"} lost${counterparty}`;
  const owner = card.direction === "LOST" ? "your" : card.counterpartyPlayerId ? "their" : undefined;
  const lostWith = featuresPart(card.features, owner);
  return lostWith ? `${text} · ${lostWith}` : text;
};

const waystationCardText = (card: Extract<PersonalActivityCard, { kind: "WAYSTATION_ACTIVATED" }>, techName: TechNameLookup): string => {
  if (card.grantedEffect === "TECH") return card.grantedTechId ? `Waystation activated · ${techName(card.grantedTechId) ?? card.grantedTechId} granted` : "Waystation activated · no unowned Manifest remained";
  if (card.grantedEffect === "RESOURCE_SLOT") return `Waystation activated · +1 ${card.grantedResource?.toLowerCase() ?? "resource"} slot`;
  if (card.grantedEffect === "GOLD") return `Waystation activated · +${roundedAmount(card.grantedGold ?? 0)} Coin`;
  if (card.grantedEffect === "MANPOWER") return `Waystation activated · +${roundedAmount(card.grantedManpower ?? 0)} manpower`;
  if (card.grantedEffect === "POPULATION") return card.populationBurst ? `Waystation activated · +${roundedAmount(card.populationBurst)} population` : "Waystation activated · no eligible town received population";
  return "Waystation activated · permanent vision revealed";
};

const townCardText = (card: Extract<PersonalActivityCard, { kind: "TOWN_CAPTURED" | "TOWN_LOST" }>, playerNames: PlayerNameLookup): string => {
  const town = card.townName ?? card.townTier.toLowerCase();
  const counterparty = card.counterpartyPlayerId ? nameOf(card.counterpartyPlayerId, playerNames) : undefined;
  const outcome = card.kind === "TOWN_CAPTURED"
    ? `Captured ${town}${counterparty ? ` from ${counterparty}` : ""}`
    : `Lost ${town}${counterparty ? ` to ${counterparty}` : ""}`;
  const aftermath = card.townSurvived ? `${roundedAmount(card.populationAfter)} population remaining` : "settlement razed";
  return `${outcome} · ${aftermath}`;
};

const dockCardText = (card: Extract<PersonalActivityCard, { kind: "DOCK_CAPTURED" | "DOCK_LOST" }>, playerNames: PlayerNameLookup): string => {
  const counterparty = card.counterpartyPlayerId ? nameOf(card.counterpartyPlayerId, playerNames) : undefined;
  if (card.kind === "DOCK_CAPTURED") return `Captured a Dock${counterparty ? ` from ${counterparty}` : ""}`;
  return `Lost your Dock${counterparty ? ` to ${counterparty}` : ""}`;
};

const buildingCardText = (card: Extract<PersonalActivityCard, { kind: "BUILDING_COMPLETED" }>): string => {
  const parts = [`${structureDisplayName(card.structureType)} completed`];
  if (card.instantGold && card.instantGold > 0) parts.push(`+${roundedAmount(card.instantGold)} coin`);
  if (card.populationBurst && card.populationBurst > 0) parts.push(`+${roundedAmount(card.populationBurst)} population`);
  return parts.join(" · ");
};

/** One timeline row's display text, given the viewing player's id and a way to resolve names. */
export const activityCardText = (card: PersonalActivityCard, playerId: string, playerNames: PlayerNameLookup, techName: TechNameLookup = () => undefined): string => {
  if (card.kind === "COMBAT") return combatCardText(card, playerId, playerNames);
  if (card.kind === "COMBAT_GROUP") return combatGroupCardText(card, playerNames);
  if (card.kind === "SIEGE") return siegeCardText(card, playerNames);
  if (card.kind === "TERRITORY_FLIP_GROUP") return territoryCardText(card, playerNames);
  if (card.kind === "WAYSTATION_ACTIVATED") return waystationCardText(card, techName);
  if (card.kind === "TOWN_CAPTURED" || card.kind === "TOWN_LOST") return townCardText(card, playerNames);
  if (card.kind === "DOCK_CAPTURED" || card.kind === "DOCK_LOST") return dockCardText(card, playerNames);
  if (card.kind === "BUILDING_COMPLETED") return buildingCardText(card);
  if (card.kind === "DIPLOMACY") return diplomacyCardText(card, playerId, playerNames);
  if (card.kind === "TRUNCATION_NOTE") return `${card.hiddenCount} smaller event${card.hiddenCount === 1 ? "" : "s"} not shown`;
  // A card kind from a newer server than this client: say something true
  // rather than misreading it as a truncation note.
  return "Activity on your territory";
};

export const activityCardTimeLabel = (card: PersonalActivityCard): string => timeLabel(card.occurredAt);

/** Map events carry a location; the truncation note and diplomacy rows (between empires, not on a tile) never do. */
export const activityCardCoordinates = (card: PersonalActivityCard): { x: number; y: number } | undefined =>
  card.kind === "TRUNCATION_NOTE" || card.kind === "DIPLOMACY" ? undefined : { x: card.x, y: card.y };

/** The "(x, y)" tile label shown on a timeline row, matching the feed's coordinate format. */
export const activityCardCoordinatesLabel = (card: PersonalActivityCard): string | undefined => {
  const coords = activityCardCoordinates(card);
  return coords ? `(${coords.x}, ${coords.y})` : undefined;
};
