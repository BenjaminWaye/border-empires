import { MANPOWER_REFILL_WINDOW_MS, terrainAdjustedTownManpower, type PopulationTier } from "@border-empires/shared";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import type { BiotaTownStatus } from "@border-empires/sim-protocol";

const escapeHtml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const pips = (received: number, needed: number): string => "●".repeat(received) + "○".repeat(Math.max(0, needed - received));

/**
 * Town menu line for a City, Great City or Metropolis: how much biota it gets
 * and, when it is short, the tier it is working as and the manpower lost.
 */
export function townBiotaLineHtml(
  tileKey: string,
  tier: PopulationTier,
  biotaTowns: readonly BiotaTownStatus[] | undefined,
  terrain: { terrainProfile?: Parameters<typeof terrainAdjustedTownManpower>[1]; coastal?: Parameters<typeof terrainAdjustedTownManpower>[2] }
): string | undefined {
  const status = biotaTowns?.find(entry => entry.tileKey === tileKey);
  if (!status || status.needed <= 0) return undefined;
  const head = `Biota ${pips(status.received, status.needed)} ${status.received} of ${status.needed}`;
  if (status.received >= status.needed) return `${escapeHtml(head)} · full manpower`;
  const full = terrainAdjustedTownManpower(tier, terrain.terrainProfile, terrain.coastal);
  const reduced = terrainAdjustedTownManpower(status.manpowerTier, terrain.terrainProfile, terrain.coastal);
  const perRefill = Math.round((full.regenPerMinute - reduced.regenPerMinute) * MANPOWER_REFILL_WINDOW_MS / 60_000);
  return escapeHtml(`Unruly · ${head} · working as a ${displayTownPopulationTierLabel(status.manpowerTier)} · −${Math.round(full.cap - reduced.cap).toLocaleString()} manpower cap, −${perRefill} per refill`);
}
