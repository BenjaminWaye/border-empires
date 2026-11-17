// Luxury biota on the town screen: a City, Great City or Metropolis needs
// biota slots, and a town short of them is unruly and gives a smaller tier's
// manpower (ManpowerBreakdown.biotaTowns). The screen shows how many slots it
// gets and works the manpower card out from the tier it is actually giving.

import { BIOTA_SLOTS_PER_SITE, RESOURCE_NETWORKS, type PopulationTier } from "@border-empires/shared";
import type { BiotaTownStatus } from "@border-empires/sim-protocol";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";

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

export const townBiota = (tier: PopulationTier, status: BiotaTownStatus | undefined): TownBiota => {
  if (!status || status.needed <= 0) return { manpowerTier: tier, rowHtml: "" };
  const short = status.received < status.needed;
  const head = `${pips(status.received, status.needed)} ${status.received} of ${status.needed}`;
  const detail = short
    ? `${head} · ${RESOURCE_NETWORKS.LUXURY_BIOTA.buildingName} supplies ${BIOTA_SLOTS_PER_SITE}`
    : `${head} · Full manpower`;
  const rowHtml = `<div class="v2t-built"><span><span class="v2t-built-name">${short ? "Unruly · luxury biota" : "Luxury biota"}</span><span class="v2t-built-mods"><span class="v2t-mod-${short ? "negative" : "positive"}">${esc(detail)}</span></span></span></div>`;
  if (!short) return { manpowerTier: tier, rowHtml };
  return {
    manpowerTier: status.manpowerTier,
    unrulyNote: `Unruly · working as a ${displayTownPopulationTierLabel(status.manpowerTier)}`,
    rowHtml
  };
};
