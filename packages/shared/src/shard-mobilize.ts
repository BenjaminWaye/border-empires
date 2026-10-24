// Shard Mobilization: the comeback lever. Donating one Shard to the Court
// buys an Imperial delivery of ready-made ancillaries that refills the
// empire's manpower to its cap instantly, so a House that was beaten down
// while offline can return and fight back straight away instead of waiting
// out several 4-hour refill windows (manpower-refill.ts).
//
// Deliberately "to the cap", never above it: unlike the landing reserve or a
// Waystation grant this is not overflow manpower, so it can't be stacked into
// a pool bigger than the empire's territory supports.
export const SHARD_MOBILIZE_SHARD_COST = 1;
