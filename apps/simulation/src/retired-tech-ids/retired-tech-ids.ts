// Manifests removed from tech-tree.json whose unlocks moved onto another
// Manifest. A saved player who owns the retired id but not its replacement is
// restored owning the replacement instead, so they keep what they paid for.
//
// A player who already owns the replacement keeps the retired id as a
// counted placeholder: it unlocks nothing (no catalog entry), but the owned
// count prices the next Manifest (techGoldCostForResearchedCount) and feeds
// Reveal Stats, and collapsing the two ids would quietly make that player's
// next Manifest cheaper.
//
// - surveying (Echo-Reader Crew): Survey Sweep moved onto Augury Office. The
//   old tree made Augury Office require it, so every Augury Office owner
//   takes the placeholder path.
const RETIRED_TECH_REPLACEMENTS: Readonly<Record<string, string>> = {
  surveying: "beacon-towers"
};

export const migrateRetiredTechIds = (techIds: Iterable<string>): Set<string> => {
  const owned = new Set(techIds);
  const out = new Set<string>();
  for (const techId of owned) {
    const replacement = Object.prototype.hasOwnProperty.call(RETIRED_TECH_REPLACEMENTS, techId) ? RETIRED_TECH_REPLACEMENTS[techId] : undefined;
    out.add(replacement && !owned.has(replacement) ? replacement : techId);
  }
  return out;
};
