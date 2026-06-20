import { MANPOWER_BASE_CAP } from "@border-empires/game-domain";

import type { RuntimePlayer } from "./runtime-types.js";

export const createHumanRuntimePlayer = (playerId: string): RuntimePlayer => ({
  id: playerId,
  isAi: false,
  name: playerId,
  points: 100,
  manpower: MANPOWER_BASE_CAP,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-runtime",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
  strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
});
