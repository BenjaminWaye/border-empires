import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";

// Shared by the runtime-backed encirclement tests (encirclement*.test.ts).
export const ENCIRCLEMENT_DECAY_MS_LOCAL = 60_000; // historical window; encirclement is instant now, this is only a timer fixture

export const player = (id: string, points = 10_000, manpower = 10_000) => ({
  id,
  isAi: false,
  points,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS }
});

export const mkRuntime = (tiles: Array<{
  x: number;
  y: number;
  terrain: "LAND" | "SEA";
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
  frontierDecayAt?: number;
  frontierDecayKind?: "ENCIRCLEMENT";
}>, players = ["player-1", "player-2"]) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map(players.map((id) => [id, player(id)])),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });
