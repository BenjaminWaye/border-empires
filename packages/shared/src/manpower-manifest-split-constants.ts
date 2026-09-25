// Manifest tree naming/lore pass (docs/manifest-tree-mapping-plan.md): the
// Ancillary Factory/Ancillary Depot/Reserve Lattice/Neural Works split.
// Extracted from config.ts (500-line source budget, see AGENTS.md) rather
// than growing that already-oversized file further.
//
// Ancillary Depot reuses config.ts's GARRISON_HALL_MANPOWER_CAP_BONUS flat
// +150/building cap value (just applied to Ancillary Depot's own count
// instead of Garrison Hall's). Neural Works reuses config.ts's
// RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_GARRISON_HALL (previously defined
// but unused — Assembly Works only fed the CAP amplifier before this pass)
// for its +0.1/min-per-networked-Ancillary-Factory regen. Ancillary Factory
// itself moves from a cap bonus to a flat regen, granted here.
export const GARRISON_HALL_MANPOWER_REGEN_PER_MINUTE = 0.05;
