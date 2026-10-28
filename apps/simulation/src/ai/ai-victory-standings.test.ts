import { describe, expect, it, vi } from "vitest";
import type { SeasonVictoryObjectiveSnapshot } from "@border-empires/sim-protocol";
import type { SeasonVictoryPathId } from "@border-empires/shared";

import {
  createAiProducerRuntime,
  createVictoryStandingsLookup,
  victoryProgressByPlayer,
  withVictoryStandings,
  type AiProducerRuntime,
  type VictoryStandingsSource
} from "./ai-victory-standings.js";
import type { PlannerPlayerView } from "./planner-world-view.js";

const objective = (overrides: Partial<SeasonVictoryObjectiveSnapshot> & Pick<SeasonVictoryObjectiveSnapshot, "id">): SeasonVictoryObjectiveSnapshot => ({
  name: overrides.id,
  description: "",
  leaderName: "",
  progressLabel: "",
  thresholdLabel: "",
  holdDurationSeconds: 86_400,
  statusLabel: "",
  conditionMet: false,
  ...overrides
});

const selfProgress = (entries: Record<string, Partial<Record<SeasonVictoryPathId, number>>>): VictoryStandingsSource["selfProgress"] =>
  new Map(Object.entries(entries).map(([id, paths]) => [id, new Map(Object.entries(paths) as Array<[SeasonVictoryPathId, number]>)]));

const view = (id: string): PlannerPlayerView => ({ id }) as PlannerPlayerView;

describe("victoryProgressByPlayer", () => {
  it("merges the leader's objective progress with everyone else's self-progress", () => {
    const progress = victoryProgressByPlayer({
      objectives: [
        objective({ id: "ECONOMIC_HEGEMONY", leaderPlayerId: "ai-1", progress: 0.4 }),
        objective({ id: "TOWN_CONTROL", leaderPlayerId: "ai-2", conditionMet: true, progress: 0.7 }),
        objective({ id: "MARITIME_SUPREMACY" })
      ],
      selfProgress: selfProgress({ "ai-1": { TOWN_CONTROL: 0.3 }, "ai-2": { ECONOMIC_HEGEMONY: 0.25 } })
    });
    expect(progress.get("ai-1")).toEqual({ TOWN_CONTROL: 0.3, ECONOMIC_HEGEMONY: 0.4 });
    expect(progress.get("ai-2")).toEqual({ ECONOMIC_HEGEMONY: 0.25, TOWN_CONTROL: 1 });
  });
});

describe("createVictoryStandingsLookup", () => {
  it("returns undefined before any objectives exist so the planner keeps its heuristic", () => {
    const lookup = createVictoryStandingsLookup(() => ({ objectives: [], selfProgress: new Map() }));
    expect(lookup("ai-1")).toBeUndefined();
  });

  it("gives an unranked player explicit zero progress once standings exist", () => {
    const lookup = createVictoryStandingsLookup(() => ({ objectives: [objective({ id: "TOWN_CONTROL", leaderPlayerId: "ai-2", progress: 0.5 })], selfProgress: new Map() }));
    expect(lookup("ai-9")).toEqual({});
  });

  it("recomputes only when the source is replaced", () => {
    let source: VictoryStandingsSource = { objectives: [objective({ id: "TOWN_CONTROL", leaderPlayerId: "ai-1", progress: 0.2 })], selfProgress: new Map() };
    const lookup = createVictoryStandingsLookup(() => source);
    const first = lookup("ai-1");
    expect(lookup("ai-1")).toBe(first);
    source = { objectives: [objective({ id: "TOWN_CONTROL", leaderPlayerId: "ai-1", progress: 0.6 })], selfProgress: new Map() };
    expect(lookup("ai-1")).toEqual({ TOWN_CONTROL: 0.6 });
  });
});

describe("createAiProducerRuntime", () => {
  it("attaches standings to both world-view and player-view exports", () => {
    const runtime = {
      queueDepths: vi.fn(),
      onEvent: vi.fn(),
      exportPlannerWorldView: vi.fn(() => ({ tiles: [], players: [view("ai-1")] })),
      exportPlannerPlayerViews: vi.fn(() => [view("ai-1"), view("ai-2")]),
      exportTilesForKeys: vi.fn(() => [])
    } as unknown as AiProducerRuntime;
    const lookup = createVictoryStandingsLookup(() => ({
      objectives: [objective({ id: "ECONOMIC_HEGEMONY", leaderPlayerId: "ai-1", progress: 0.8 })],
      selfProgress: selfProgress({ "ai-2": { ECONOMIC_HEGEMONY: 0.5 } })
    }));
    const adapted = createAiProducerRuntime(runtime, (_phase, _details, task) => task(), lookup);
    expect(adapted.exportPlannerWorldView(["ai-1"]).players[0]?.victoryProgress).toEqual({ ECONOMIC_HEGEMONY: 0.8 });
    expect(adapted.exportPlannerPlayerViews(["ai-1", "ai-2"]).map((player) => player.victoryProgress)).toEqual([
      { ECONOMIC_HEGEMONY: 0.8 },
      { ECONOMIC_HEGEMONY: 0.5 }
    ]);
  });

  it("leaves views untouched when no standings exist", () => {
    const players = [view("ai-1")];
    expect(withVictoryStandings(players, () => undefined)[0]).toBe(players[0]);
  });
});
