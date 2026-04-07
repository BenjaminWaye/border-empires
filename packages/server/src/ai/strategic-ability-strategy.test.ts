import { describe, expect, it } from "vitest";

import {
  chooseAiStrategicAbility,
  scoreAiObservatoryCandidate,
  type AiStrategicAbilityCandidate,
  type AiStrategicAbilityContext
} from "./strategic-ability-strategy.js";

const baseContext = (): AiStrategicAbilityContext => ({
  primaryVictoryPath: "ECONOMIC_HEGEMONY",
  strategicFocus: "ECONOMIC_RECOVERY",
  frontPosture: "CONTAIN",
  underThreat: false,
  threatCritical: false,
  economyWeak: false,
  foodCoverageLow: false,
  pressureThreatensCore: false,
  canBuildObservatory: false,
  hasActiveObservatory: false,
  canRevealEmpire: false,
  revealAlreadyActive: false,
  canCastAetherBridge: false,
  canSiphonTile: false,
  canAcceptAlliance: false,
  canRequestAlliance: false,
  targetLeading: false
});

const candidate = (overrides: Partial<AiStrategicAbilityCandidate> = {}): AiStrategicAbilityCandidate => ({
  tileIndex: 1,
  isTown: false,
  isDock: false,
  supportedTownCount: 0,
  supportedDockCount: 0,
  connectedTownCount: 0,
  connectedDockCount: 0,
  borderPressure: 0,
  ...overrides
});

describe("strategic ability strategy", () => {
  it("prefers building an observatory when it secures dock and town coverage", () => {
    const decision = chooseAiStrategicAbility(
      { ...baseContext(), canBuildObservatory: true },
      [candidate({ tileIndex: 9, isDock: true, supportedDockCount: 1, connectedDockCount: 2, supportedTownCount: 1 })]
    );

    expect(decision?.kind).toBe("build_observatory");
    expect(decision && "tileIndex" in decision ? decision.tileIndex : undefined).toBe(9);
  });

  it("uses reveal empire against a leading hostile when observatory is unavailable", () => {
    const decision = chooseAiStrategicAbility(
      {
        ...baseContext(),
        primaryVictoryPath: "TOWN_CONTROL",
        strategicFocus: "MILITARY_PRESSURE",
        frontPosture: "BREAK",
        canRevealEmpire: true,
        targetPlayerId: "enemy-1",
        targetLeading: true
      },
      []
    );

    expect(decision?.kind).toBe("reveal_empire");
    expect(decision && "targetPlayerId" in decision ? decision.targetPlayerId : undefined).toBe("enemy-1");
  });

  it("scores observatory tiles higher when they cover connected core assets", () => {
    const dockHub = scoreAiObservatoryCandidate(
      candidate({ isDock: true, supportedDockCount: 1, connectedDockCount: 2, supportedTownCount: 1 })
    );
    const emptyInterior = scoreAiObservatoryCandidate(candidate());

    expect(dockHub).toBeGreaterThan(emptyInterior);
  });

  it("chooses aether bridge when island expansion is the live strategic bottleneck", () => {
    const decision = chooseAiStrategicAbility(
      {
        ...baseContext(),
        primaryVictoryPath: "SETTLED_TERRITORY",
        strategicFocus: "ISLAND_FOOTPRINT",
        canCastAetherBridge: true
      },
      [],
      [{ tileIndex: 44, score: 132 }]
    );

    expect(decision?.kind).toBe("cast_aether_bridge");
    expect(decision && "tileIndex" in decision ? decision.tileIndex : undefined).toBe(44);
  });

  it("chooses siphon against a leading hostile target when observatory pressure exists", () => {
    const decision = chooseAiStrategicAbility(
      {
        ...baseContext(),
        strategicFocus: "MILITARY_PRESSURE",
        frontPosture: "BREAK",
        canSiphonTile: true,
        targetLeading: true
      },
      [],
      [],
      [{ tileIndex: 12, score: 128 }]
    );

    expect(decision?.kind).toBe("siphon_tile");
  });

  it("accepts alliances when under pressure and a request is available", () => {
    const decision = chooseAiStrategicAbility(
      {
        ...baseContext(),
        underThreat: true,
        economyWeak: true,
        canAcceptAlliance: true
      },
      [],
      [],
      [],
      [{ requestId: "req-1", playerId: "ally-1", score: 95 }]
    );

    expect(decision?.kind).toBe("accept_alliance");
    expect(decision && "requestId" in decision ? decision.requestId : undefined).toBe("req-1");
  });

  it("requests an alliance when stabilizing against a stronger rival", () => {
    const decision = chooseAiStrategicAbility(
      {
        ...baseContext(),
        underThreat: true,
        frontPosture: "CONTAIN",
        canRequestAlliance: true,
        targetLeading: true
      },
      [],
      [],
      [],
      [],
      [{ playerId: "ally-2", score: 78 }]
    );

    expect(decision?.kind).toBe("request_alliance");
    expect(decision && "playerId" in decision ? decision.playerId : undefined).toBe("ally-2");
  });
});
