// Manifests removed from tech-tree.json whose unlocks moved onto another
// Manifest. A saved player who owns the retired id is restored owning its
// replacement instead, so they keep what they paid for (and their owned
// count, which prices the next Manifest, is unchanged).
//
// - surveying (Echo-Reader Crew): Survey Sweep moved onto Augury Office.
const RETIRED_TECH_REPLACEMENTS: Readonly<Record<string, string>> = {
  surveying: "beacon-towers"
};

export const migrateRetiredTechIds = (techIds: Iterable<string>): Set<string> => {
  const out = new Set<string>();
  for (const techId of techIds) out.add(Object.prototype.hasOwnProperty.call(RETIRED_TECH_REPLACEMENTS, techId) ? RETIRED_TECH_REPLACEMENTS[techId]! : techId);
  return out;
};
