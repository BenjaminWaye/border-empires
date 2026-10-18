import { observatoryCrystalSlotCostForOwnedCount } from "@border-empires/shared";
import type { DormancyContributor, SlotWaivers } from "./resource-slot-view.js";

// User decision: each additional Observatory a player owns costs progressively
// more CRYSTAL upkeep — 1st = 1 slot, 2nd = 2, 3rd = 3, and so on (earliest
// build-order first, same tie-break convention as the Fort/Siege Battery
// waivers above). Overwrites the flat count=1 that addContributor above
// stamped from structureSlotRequirements("OBSERVATORY") — mutates in place
// since these are the same contributor objects already pushed into the array.
export const applyObservatoryProgressiveCost = (contributors: DormancyContributor[]): void => {
  const observatoryContributors = contributors
    .filter((c) => c.key.endsWith(":observatory"))
    .sort((a, b) => a.activatedAt - b.activatedAt || a.key.localeCompare(b.key));
  observatoryContributors.forEach((c, index) => {
    c.count = observatoryCrystalSlotCostForOwnedCount(index);
  });
};

export const applySlotWaivers = (contributors: DormancyContributor[], waivers: SlotWaivers, relayBeaconKeys: Record<string, boolean> = {}): DormancyContributor[] => {
  const waiveEarliestStructures = (fieldSuffix: ":fort" | ":siegeBattery" | ":observatory", waiveCount: number): ReadonlySet<string> => {
    if (waiveCount <= 0) return new Set();
    const activatedAtByKey = new Map<string, number>();
    for (const c of contributors) {
      if (c.key.endsWith(fieldSuffix)) activatedAtByKey.set(c.key, c.activatedAt);
    }
    const keys = [...activatedAtByKey.keys()].sort(
      (a, b) => (activatedAtByKey.get(a) ?? 0) - (activatedAtByKey.get(b) ?? 0) || a.localeCompare(b)
    );
    return new Set(keys.slice(0, waiveCount));
  };
  const waivedTowers = waiveEarliestStructures(":observatory", waivers.observatoryCrystalSlotWaiverCount ?? 0);
  const waivedForts = waiveEarliestStructures(":fort", waivers.fortTitaniumSlotWaiverCount);
  const waivedOutposts = waiveEarliestStructures(":siegeBattery", waivers.outpostUmbriteSlotWaiverCount);

  // RELAY_BEACON waiver: find economicStructure keys that contain RELAY_BEACON
  // and waive the earliest ones. Track by tile key (deduplicate per-tile) with
  // activation order matching Forts/Outposts above.
  const waivedRelayBeacons = new Set<string>();
  if (waivers.relayBeaconFoodSlotWaiverCount > 0) {
    const activatedAtByTileKey = new Map<string, number>();
    for (const c of contributors) {
      if (c.key.endsWith(":economicStructure") && relayBeaconKeys[c.key] && c.resource === "FOOD") {
        const tileKey = c.key.slice(0, c.key.length - ":economicStructure".length);
        if (!activatedAtByTileKey.has(tileKey)) activatedAtByTileKey.set(tileKey, c.activatedAt);
      }
    }
    const keys = [...activatedAtByTileKey.keys()].sort(
      (a, b) => (activatedAtByTileKey.get(a) ?? 0) - (activatedAtByTileKey.get(b) ?? 0) || a.localeCompare(b)
    );
    for (const tileKey of keys.slice(0, waivers.relayBeaconFoodSlotWaiverCount)) {
      waivedRelayBeacons.add(`${tileKey}:economicStructure`);
    }
  }

  const townKeys = [...new Set(contributors.filter((c) => c.key.endsWith(":town")).map((c) => c.key))].sort((a, b) => a.localeCompare(b));
  const firstWaivedTownKeys = new Set(
    waivers.firstTownsFoodSlotWaiverCount > 0 ? townKeys.slice(0, waivers.firstTownsFoodSlotWaiverCount) : []
  );

  return contributors.map((c) => {
    if (c.key.endsWith(":observatory") && c.resource === "CRYSTAL" && waivedTowers.has(c.key)) return { ...c, count: 0 };
    if (c.key.endsWith(":fort") && c.resource === "TITANIUM" && waivedForts.has(c.key)) return { ...c, count: 0 };
    if (c.key.endsWith(":siegeBattery") && c.resource === "UMBRITE" && waivedOutposts.has(c.key)) return { ...c, count: 0 };
    if (c.key.endsWith(":economicStructure") && relayBeaconKeys[c.key] && c.resource === "FOOD" && waivedRelayBeacons.has(c.key)) return { ...c, count: 0 };
    if (c.key.endsWith(":town")) {
      const core = waivers.afcCoreTownKeys?.includes(c.key.slice(0, -":town".length)) ? waivers.firstThreeTownsFoodSlotReduction ?? 0 : 0;
      const waiver = Math.max(waivers.allTownsFoodSlotWaiverPerTown, firstWaivedTownKeys.has(c.key) ? 1 : 0, core);
      if (waiver > 0) return { ...c, count: Math.max(0, c.count - waiver) };
    }
    return c;
  });
};

