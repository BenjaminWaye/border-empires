// Planetary Defense (internal owner id "barbarian-1") tuning, re-exported from config.ts.

// Planetary Defense camps (docs/planetary-defense-camps-plan.md). A camp is a
// SETTLED Planetary Defense tile; its land is FRONTIER carrying its campId.
// New camps come only from captured towns and docks, up to this many; at the
// cap a captured town or dock becomes plain FRONTIER. There is no cap on the
// total number of Planetary Defense tiles, only per camp (below).
export const MAX_PLANETARY_DEFENSE_CAMPS = 100;
// A camp rests this long after its action SETTLES (combat resolved, claim
// resolved, or command rejected) before it may act again. Counted from settle,
// not issue: combat locks for COMBAT_LOCK_MS, so counting from issue leaves no
// rest at all between fights.
export const BARBARIAN_TILE_REST_MS = 15_000;
// Expanding into neutral land rests a camp this long instead: AI empires keep
// most camps awake all the time, so at the attack rest every camp took four
// tiles a minute and Planetary Defense swamped the map.
export const PLANETARY_DEFENSE_EXPAND_REST_MS = 60_000;
// A camp holding this many tiles, its camp included, stops expanding and stops
// attacking frontier. It still raids garrisoned House land (raid-limited) and
// takes towns and docks while they found new camps (below MAX_PLANETARY_DEFENSE_CAMPS).
export const MAX_PLANETARY_DEFENSE_CAMP_TILES = 20;
// Faction-wide budget of barbarian ATTACKS started per rolling minute (all
// camps on the map combined). Attacks are the expensive action (~15ms main
// thread each, mostly the encirclement flood-fill); expansions into neutral
// land are cheap (~0.5ms) and unbudgeted.
export const BARBARIAN_ATTACKS_PER_MINUTE = 12;
// Raid limit: one camp may launch at most this many attacks on any one House's
// garrisoned (SETTLED) tiles per manpower window (MANPOWER_REFILL_WINDOW_MS),
// won or lost. Attacks on frontier don't count. A camp founded during a House's
// window gets no raids on that House until its next window, so a camp born from
// a captured town doesn't add fresh raids to the window it was taken in.
export const PLANETARY_DEFENSE_RAIDS_PER_HOUSE_PER_WINDOW = 3;
// Safety net if no settle event ever arrives for an in-flight barb command.
// Longer than COMBAT_LOCK_MS.
export const BARBARIAN_INFLIGHT_TIMEOUT_MS = 45_000;
export const BARBARIAN_ATTACK_POWER = 1.0;
export const BARBARIAN_DEFENSE_POWER = 0.67;
export const INITIAL_BARBARIAN_COUNT = 80;
