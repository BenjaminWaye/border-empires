/**
 * Bench: the barbarian "seen by a player" check on a busy map.
 *
 * Scenario (matches docs/barbarian-activation-plan.md): 25 empires x ~1,500
 * settled tiles, 100 barbarian tiles. The replaced hand-rolled union cost ~11ms
 * per recompute here; this is the per-recompute cost of the coverage-based set,
 * and of one planner `choose()` with every barbarian tile seen.
 *
 * Run: pnpm --filter @border-empires/simulation bench
 */
import { bench, describe } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime/runtime.js";
import { createBarbarianPlanner } from "./ai/system-job-barbarian-planner.js";
import type { PlannerTileView } from "./ai/planner-world-view.js";

const makePlayer = (id: string) => [
  id,
  { id, isAi: id.startsWith("ai-"), points: 100, manpower: 150, techIds: new Set<string>(), domainIds: new Set<string>(), mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techRootId: "rewrite-local", allies: new Set<string>() }
] as const;

const PLAYERS = 25;
const TILES_PER_PLAYER = 1_500;
const BARB_TILES = 100;

let seed = 1;
const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

const tiles: Array<{ x: number; y: number; terrain: "LAND"; ownerId: string; ownershipState: "SETTLED" }> = [];
const owned = new Set<string>();
const players: Array<ReturnType<typeof makePlayer>> = [];
for (let p = 0; p < PLAYERS; p += 1) {
  const id = `ai-${p}`;
  players.push(makePlayer(id));
  const cx = Math.floor(rnd() * WORLD_WIDTH);
  const cy = Math.floor(rnd() * WORLD_HEIGHT);
  const side = Math.ceil(Math.sqrt(TILES_PER_PLAYER));
  for (let i = 0; i < TILES_PER_PLAYER; i += 1) {
    const x = (cx + (i % side)) % WORLD_WIDTH;
    const y = (cy + Math.floor(i / side)) % WORLD_HEIGHT;
    if (owned.has(`${x},${y}`)) continue;
    owned.add(`${x},${y}`);
    tiles.push({ x, y, terrain: "LAND", ownerId: id, ownershipState: "SETTLED" });
  }
}
players.push(makePlayer("barbarian-1"));
// A 10-wide block of barbarians starting 60 tiles east of the first empire.
const barbKeys: string[] = [];
for (let i = 0; barbKeys.length < BARB_TILES && i < 4 * BARB_TILES; i += 1) {
  const x = (tiles[0]!.x + 60 + (i % 10)) % WORLD_WIDTH;
  const y = (tiles[0]!.y + Math.floor(i / 10)) % WORLD_HEIGHT;
  const key = `${x},${y}`;
  if (owned.has(key)) continue;
  owned.add(key);
  barbKeys.push(key);
  tiles.push({ x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" });
}

const runtime = new SimulationRuntime({
  now: () => 1_000,
  initialPlayers: new Map(players),
  seedTiles: new Map(),
  initialState: { tiles, activeLocks: [] }
});

const tilesByKey = new Map<string, PlannerTileView>(tiles.map((t) => [`${t.x},${t.y}`, t] as const));
const barbOwned = barbKeys.map((k) => tilesByKey.get(k)!);
let clock = 0;
const planner = createBarbarianPlanner({
  tilesByKey,
  resolveOwnedTiles: () => barbOwned,
  getDockLinksByDockTileKey: () => new Map(),
  getVisibleToAnyNonBarbPlayer: () => new Set(barbKeys),
  now: () => (clock += 3_000) // every call is past the no-command retry delay
});
const barbPlayer = { id: "barbarian-1", tileCollectionVersion: 1, territoryTileKeys: barbKeys };

describe(`barbarian activation: ${PLAYERS} empires x ${TILES_PER_PLAYER} tiles, ${BARB_TILES} barb tiles`, () => {
  bench("exportBarbTilesSeenByAnyPlayer (once per second on the main thread)", () => {
    runtime.exportBarbTilesSeenByAnyPlayer();
  });
  bench("barbarian planner choose() with every barb tile seen (worker thread)", () => {
    planner.choose(barbPlayer, 1, clock);
  });
});
