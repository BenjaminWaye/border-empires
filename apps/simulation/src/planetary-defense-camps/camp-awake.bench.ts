/**
 * Bench: Planetary Defense camps at full size on a busy map
 * (docs/planetary-defense-camps-plan.md, performance gate).
 *
 * Scenario: 25 AI empires x ~1,500 settled tiles (the old barbarian bench's
 * map, docs/barbarian-activation-plan.md) and 100 camps x 30 tiles = 3,000
 * Planetary Defense tiles, all awake. The old per-second seen-tile scan cost
 * ~0.09 ms at 100 tiles and one per-tile planner choose() ~0.36 ms; camps
 * replace the scan with an awake lookup and plan one camp per choose().
 *
 * Run: pnpm --filter @border-empires/simulation bench
 */
import { bench, describe } from "vitest";
import { DEFAULT_AUTO_SETTLE_PREFS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { createBarbarianPlanner } from "../ai/system-job-barbarian-planner.js";

const makePlayer = (id: string) => [
  id,
  { id, isAi: id.startsWith("ai-"), points: 100, manpower: 150, techIds: new Set<string>(), domainIds: new Set<string>(), mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techRootId: "rewrite-local", allies: new Set<string>(), autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS } }
] as const;

const PLAYERS = 25;
const TILES_PER_PLAYER = 1_500;
const CAMPS = 100;
const TILES_PER_CAMP = 30;

let seed = 1;
const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

type Seed = { x: number; y: number; terrain: "LAND"; ownerId: string; ownershipState: "SETTLED" | "FRONTIER"; campId?: string };
const tiles: Seed[] = [];
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
// Each camp is a 6x5 block: its camp tile in the corner, the rest its frontier.
// Every block sits beside an AI empire, so every camp is awake.
const empireTileCount = tiles.length;
for (let c = 0; c < CAMPS; c += 1) {
  const anchor = tiles[(c * 997) % empireTileCount]!;
  const ox = (anchor.x + 1) % WORLD_WIDTH;
  let campId: string | undefined;
  for (let i = 0; i < TILES_PER_CAMP; i += 1) {
    const x = (ox + (i % 6)) % WORLD_WIDTH;
    const y = (anchor.y + Math.floor(i / 6)) % WORLD_HEIGHT;
    const key = `${x},${y}`;
    if (owned.has(key)) continue;
    owned.add(key);
    campId ??= key;
    tiles.push({ x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: campId === key ? "SETTLED" : "FRONTIER", campId });
  }
}

const runtime = new SimulationRuntime({
  now: () => 1_000,
  initialPlayers: new Map(players),
  seedTiles: new Map(),
  initialState: { tiles, activeLocks: [] }
});
runtime.tickSideTickers(1_000);

// The planner over the same tiles, built fresh per decision so every iteration
// measures a real decision (a camp scanning its land) rather than a run of
// "every camp is busy" no-ops.
const tilesByKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
const tilesByCamp = new Map<string, Seed[]>();
for (const tile of tiles) if (tile.campId) tilesByCamp.set(tile.campId, [...(tilesByCamp.get(tile.campId) ?? []), tile]);
const campIds = [...tilesByCamp.keys()];
const awake = new Set(campIds);

describe("Planetary Defense camps at 100 camps x 30 tiles", () => {
  bench("awake camp ids (replaces the per-second seen-tile scan)", () => {
    runtime.exportAwakeCampIds();
  });

  bench("one planner decision with 100 awake camps", () => {
    const planner = createBarbarianPlanner({
      tilesByKey,
      campIds: () => campIds,
      campTiles: (campId) => tilesByCamp.get(campId) ?? [],
      getDockLinksByDockTileKey: () => new Map(),
      getAwakeCampIds: () => awake,
      now: () => 1_000
    });
    planner.choose(1, 1_000);
  });

  bench("1s side tick: watcher sync with nobody logging in or out", () => {
    runtime.tickSideTickers(1_000);
  });
});
