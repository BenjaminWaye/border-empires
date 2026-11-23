// Words for what a scout drone finds: one per kind, shared by the landing report card
// (client-scout-drone-hud.ts) and the pops over the map while it flies (client-scout-drone-finds.ts).
import { resourceLabel } from "../client-map-display.js";
import type { ScoutFindKind } from "./client-scout-drone-icons.js";

/** One word under each report icon: players could not tell a waystation pillar or a gem from the icon alone (review 2026-11-21). */
export const SCOUT_FIND_LABEL: Record<ScoutFindKind, string> = {
  explored: "Tiles",
  town: "Town",
  dock: "Dock",
  waystation: "Waystation",
  watchtower: "Tower",
  resource: "Resources",
  empire: "Empire",
  defense: "Defense"
};

/** "Town" -> "Towns" past one ("2 Waystation" read as a typo, review 2026-11-21). */
export const pluralLabel = (label: string, count: number): string => (count === 1 ? label : `${label}s`);

/** "FISH" -> "Fish", "Luxury Biota" stays. */
export const titleCase = (text: string): string => text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** A resource's name as the card and the pops show it. */
export const scoutResourceLabel = (resource: string): string => titleCase(resourceLabel(resource));
