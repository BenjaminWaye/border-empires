import { MANPOWER_BASE_CAP } from "@border-empires/game-domain";

import type { RuntimePlayer } from "./runtime-types.js";

// Worldgen always names AI player records "ai-<n>" (see
// season-worldgen.ts). Any repair/recovery path that needs to reconstruct a
// missing player record from tile ownership alone (no other context) can use
// this convention to tell an AI slot apart from a genuine human id.
const AI_PLAYER_ID_PATTERN = /^ai-\d+$/;

export const isAiPlayerId = (playerId: string): boolean => AI_PLAYER_ID_PATTERN.test(playerId);

// True for any server-controlled actor that has no WS subscriber: the "ai-<n>"
// autopilot players and the "barbarian-*" system faction. Use this — not the
// bare `player.isAi` flag — for "does this actor have a human client" decisions
// (e.g. skipping human-only capture-reveal fan-out). Barbarians deliberately
// carry isAi: false so they stay out of the AI-respawn / income-repair paths
// (barbarians propagate via walk/multiply and never respawn as settlements),
// so the flag alone under-counts them.
export const isAiControlledActor = (playerId: string, isAi: boolean | undefined): boolean =>
  isAi === true || playerId.startsWith("barbarian-");

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

export const createAiRuntimePlayer = (playerId: string): RuntimePlayer => ({
  ...createHumanRuntimePlayer(playerId),
  isAi: true
});
