// Luxury biota on the town screen: a City, Great City or Metropolis needs
// biota slots, and a town short of them is unruly and gives a smaller tier's
// manpower (ManpowerBreakdown.biotaTowns). The screen shows how many slots it
// gets and works the manpower card out from the tier it is actually giving.

import { BIOTA_SLOTS_PER_SITE, RESOURCE_NETWORKS, type PopulationTier } from "@border-empires/shared";
import type { BiotaTownStatus } from "@border-empires/sim-protocol";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import type { BiotaStep } from "./client-hud-v2-town-biota-steps.js";

export type TownBiota = {
  /** The tier whose manpower the town gives right now. */
  manpowerTier: PopulationTier;
  /** Set while the town is short: the manpower card's note. */
  unrulyNote?: string;
  /** "Town bonuses" row; empty for a town that needs no biota. */
  rowHtml: string;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pips = (received: number, needed: number): string => "●".repeat(received) + "○".repeat(Math.max(0, needed - received));

const { building, buildingName } = RESOURCE_NETWORKS.LUXURY_BIOTA;
// The building name opens its info card (what it is, where it goes, which tech unlocks it); see manifestClick.
const estateLink = `<button type="button" class="inline-info-link" data-v2-info-structure="${building}" title="About ${esc(buildingName)}">${esc(buildingName)}</button>`;
const gotoLink = (x: number, y: number): string => `<button type="button" class="inline-info-link" data-v2-town-goto="${x},${y}" title="Show on map">(${x}, ${y})</button>`;

// Matches networkBiomePriority (resource-network-biomes.ts): grass-family biomes, jungle and marsh preferred.
const HABITAT = "grows in grassland, plains, jungle and marsh";

/** One line per next step; links open the tech, the Estate's info card, or the site on the map. */
const stepHtml = (step: BiotaStep): string => {
  switch (step.kind) {
    case "research": return `Research <button type="button" class="inline-info-link" data-view-tech="${esc(step.techId)}">${esc(step.techName)}</button>`;
    case "taken": return `${step.slots} ${step.slots === 1 ? "slot goes" : "slots go"} to towns held longer`;
    case "build": return `Build a ${estateLink} (+${BIOTA_SLOTS_PER_SITE} slots) on your biota at ${gotoLink(step.x, step.y)}`;
    case "owned": return `Your biota at ${gotoLink(step.x, step.y)}`;
    case "garrison": return `Garrison your biota at ${gotoLink(step.x, step.y)}`;
    case "inactive": return `${estateLink} inactive at ${gotoLink(step.x, step.y)}`;
    case "building": return `${estateLink} going up at ${gotoLink(step.x, step.y)}`;
    case "capture": return `Nearest biota ${gotoLink(step.x, step.y)}`;
    case "search": return `No biota seen yet · ${HABITAT}`;
    case "more": return `Capture more biota · ${HABITAT}`;
  }
};

export const townBiota = (tier: PopulationTier, status: BiotaTownStatus | undefined, steps: readonly BiotaStep[] = []): TownBiota => {
  if (!status || status.needed <= 0) return { manpowerTier: tier, rowHtml: "" };
  const short = status.received < status.needed;
  const head = `${pips(status.received, status.needed)} ${status.received} of ${status.needed}`;
  const detail = short ? head : `${head} · Full manpower`;
  const stepLines = short ? steps.map((step) => `<span class="v2t-built-mods">${stepHtml(step)}</span>`).join("") : "";
  const rowHtml = `<div class="v2t-built"><span><span class="v2t-built-name">${short ? "Unruly · luxury biota" : "Luxury biota"}</span><span class="v2t-built-mods"><span class="v2t-mod-${short ? "negative" : "positive"}">${esc(detail)}</span></span>${stepLines}</span></div>`;
  if (!short) return { manpowerTier: tier, rowHtml };
  return {
    manpowerTier: status.manpowerTier,
    unrulyNote: `Unruly · working as a ${displayTownPopulationTierLabel(status.manpowerTier)}`,
    rowHtml
  };
};
