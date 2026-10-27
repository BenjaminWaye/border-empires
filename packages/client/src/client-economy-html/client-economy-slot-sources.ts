// Slot Sources for the Economy panel: the server's labelled rows
// (resourceSlots.sources, built by the sim in the same pass as the supply
// total, so they always add up to it), turned into display buckets. Nothing
// here is derived from the client's loaded tiles, which only cover the area
// around the camera.

import type { ResourceSlotSourceRow, SlotResource } from "@border-empires/shared";
import { STRUCTURE_DISPLAY_NAMES } from "../client-structure-display-names.js";
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import type { EconomyBucket } from "../client-economy-model.js";
import type { EconomyPanelArgs } from "./client-economy-html.js";

/** Looks up names the rows only carry ids for. */
export type SlotSourceNames = {
  domainName: (domainId: string) => string | undefined;
  playerName: (playerId: string) => string | undefined;
};

// Same tile names as the rest of the game (client-map-display.ts's resourceLabel).
const TILE_NAMES: Readonly<Record<string, string>> = { FARM: "Grain", FISH: "Fish", TITANIUM: "Titanium", GEMS: "Gems", UMBRITE: "Umbrite" };
const TECH_NAMES: Readonly<Record<string, string>> = { agriculture: "Agrarian Works" };

const prettyId = (id: string): string => id.toLowerCase().split(/[_-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const structureName = (id: string): string => STRUCTURE_DISPLAY_NAMES[id as keyof typeof STRUCTURE_DISPLAY_NAMES] ?? prettyId(id);

export const slotSourceLabel = (row: ResourceSlotSourceRow, names?: SlotSourceNames): string => {
  switch (row.kind) {
    case "TILE": return `${TILE_NAMES[row.id] ?? prettyId(row.id)} ${row.count === 1 ? "site" : "sites"}`;
    case "STRUCTURE_BOOST":
    case "CONVERTER": return structureName(row.id);
    case "TECH": return TECH_NAMES[row.id] ?? prettyId(row.id);
    case "UPGRADE": return names?.domainName(row.id) ?? prettyId(row.id);
    case "WAYSTATION": return "Waystation";
    // Player names are user-chosen and this label is written into HTML.
    case "SIPHON": return `Siphon from ${escapeHtml(names?.playerName(row.id) ?? "a rival")}`;
    case "FOUNDRY_HEART": return "Foundry Heart";
    case "RELIC": return "Foundry Heart relic";
  }
};

export const slotSourcesForResource = (args: EconomyPanelArgs, resource: SlotResource): EconomyBucket[] => {
  const rows = args.resourceSlots.sources?.[resource];
  const supply = args.resourceSlots.supply[resource];
  // A server too old to send rows: show the total rather than an empty column.
  if (!rows) return supply > 0 ? [{ label: "Slots", amountPerMinute: supply, count: 1 }] : [];
  return rows
    .map((row) => ({ label: slotSourceLabel(row, args.slotSourceNames), amountPerMinute: row.slots, count: row.count }))
    .sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
};
