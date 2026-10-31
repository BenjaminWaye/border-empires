// Where a player's resource slots come from, one row per source, built by the
// sim in the same pass that sums its slot supply (so the rows always add up to
// resourceSlots.supply) and sent to the client for the Economy panel.

import type { SlotResource } from "../structure-slots/structure-slots.js";

/**
 * TILE: owned settled resource tiles (id = tile resource, e.g. "TITANIUM").
 * STRUCTURE_BOOST: a structure's bonus on a resource tile (id = structure type:
 *   same-tile Mine/Hydrogarden/etc., or a radius HYDROWORKS / ORE_REFINERY).
 * CONVERTER: a SYNTHESIZE-mode converter (id = structure type).
 * TECH: a tech bonus (id = tech id, e.g. "agriculture" for the fish bonus).
 * UPGRADE: an installed domain / AFC upgrade (id = domain or upgrade id).
 * WAYSTATION, FOUNDRY_HEART, RELIC: those effects (id = "").
 * SIPHON: slots siphoned from another player (id = that player's id).
 */
export type ResourceSlotSourceKind =
  | "TILE"
  | "STRUCTURE_BOOST"
  | "CONVERTER"
  | "TECH"
  | "UPGRADE"
  | "WAYSTATION"
  | "SIPHON"
  | "TRADE_IMPORT"
  | "TRADE_EXPORT"
  | "FOUNDRY_HEART"
  | "RELIC";

/** One source: slots from count contributions; TRADE_EXPORT slots are negative commitments. */
export type ResourceSlotSourceRow = { kind: ResourceSlotSourceKind; id: string; slots: number; count: number };

export type ResourceSlotSources = Record<SlotResource, ResourceSlotSourceRow[]>;

export type ResourceSlotSourceSink = (resource: SlotResource, kind: ResourceSlotSourceKind, id: string, slots: number) => void;

/** A flat slot grant from one source, e.g. an upgrade's chosen-resource slots. */
export type ResourceSlotGrant = { kind: ResourceSlotSourceKind; id: string; supply: Partial<Record<SlotResource, number>> };

export const emptyResourceSlotSources = (): ResourceSlotSources => ({ FOOD: [], TITANIUM: [], CRYSTAL: [], UMBRITE: [] });

/** Collects sink calls into rows, merging repeats of the same kind + id per resource. */
export const createResourceSlotSourceCollector = (): { sink: ResourceSlotSourceSink; rows: () => ResourceSlotSources } => {
  const sources = emptyResourceSlotSources();
  const byKey = new Map<string, ResourceSlotSourceRow>();
  const sink: ResourceSlotSourceSink = (resource, kind, id, slots) => {
    // A persisted grant can carry a non-slot key (e.g. SHARD); it has no row to go in.
    if (slots <= 0 || !sources[resource]) return;
    const key = `${resource}|${kind}|${id}`;
    const row = byKey.get(key);
    if (row) {
      row.slots += slots;
      row.count += 1;
      return;
    }
    const created = { kind, id, slots, count: 1 };
    byKey.set(key, created);
    sources[resource].push(created);
  };
  return { sink, rows: () => sources };
};
