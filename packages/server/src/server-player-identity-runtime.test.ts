import { describe, expect, it } from "vitest";
import type { MissionStats, Player, TileKey } from "@border-empires/shared";

import { createServerPlayerIdentityRuntime } from "./server-player-identity-runtime.js";

const defaultMissionStats = (): MissionStats => ({
  neutralCaptures: 0,
  enemyCaptures: 0,
  combatWins: 0,
  maxTilesHeld: 0,
  maxSettledTilesHeld: 0,
  maxFarmsHeld: 0,
  maxContinentsHeld: 0,
  maxTechPicks: 0
});

const makeAiPlayer = (id: string, name: string, tileColor: string): Player => ({
  id,
  name,
  isAi: true,
  profileComplete: true,
  points: 10,
  level: 0,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  powerups: {},
  tileColor,
  missions: [],
  missionStats: defaultMissionStats(),
  territoryTiles: new Set<TileKey>(),
  T: 0,
  E: 0,
  Ts: 0,
  Es: 0,
  stamina: 10,
  staminaUpdatedAt: 0,
  manpower: 10,
  manpowerUpdatedAt: 0,
  manpowerCapSnapshot: 10,
  allies: new Set<string>(),
  spawnShieldUntil: 0,
  isEliminated: false,
  respawnPending: false,
  lastActiveAt: 0,
  lastEconomyWakeAt: 0,
  activityInbox: []
});

describe("server player identity runtime", () => {
  it("assigns AI players a dedicated fun color palette instead of the default hashed color", () => {
    const players = new Map<string, Player>([
      ["ai-existing", makeAiPlayer("ai-existing", "AI Empire 1", "#default-ai-existing")],
      ["ai-custom", makeAiPlayer("ai-custom", "StormHowl", "#123456")]
    ]);

    const runtime = createServerPlayerIdentityRuntime({
      players,
      authIdentityByUid: new Map(),
      AI_PLAYERS: 3,
      FOG_ADMIN_EMAIL: "fog@example.com",
      STARTING_GOLD: 10,
      STARTING_MANPOWER: 10,
      STAMINA_MAX: 10,
      colorFromId: (id) => `#default-${id}`,
      defaultMissionStats,
      now: () => 100,
      randomUUID: () => "ai-new",
      initializeAiPlayerRuntimeState: () => undefined,
      cleanupRemovedAiPlayer: () => undefined
    });

    runtime.ensureAiPlayers();

    expect(players.get("ai-existing")?.name).not.toBe("AI Empire 1");
    expect(players.get("ai-existing")?.tileColor).not.toBe("#default-ai-existing");
    expect(players.get("ai-existing")?.tileColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(players.get("ai-custom")?.tileColor).toBe("#123456");
    expect(players.get("ai-new")?.tileColor).not.toBe("#default-ai-new");
    expect(players.get("ai-new")?.tileColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
