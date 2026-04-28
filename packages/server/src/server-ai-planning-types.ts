import type { AiTerritorySummary } from "./server-ai-frontier-types.js";

export type AiTurnAnalysis = {
  territorySummary: AiTerritorySummary;
  aiIncome: number;
  runnerUpIncome: number;
  controlledTowns: number;
  settledTiles: number;
  frontierTiles: number;
  worldFlags: Set<string>;
  underThreat: boolean;
  foodCoverage: number;
  foodCoverageLow: boolean;
  economyWeak: boolean;
  frontierDebt: boolean;
  threatCritical: boolean;
};

export type AiStrategicFocus =
  | "BALANCED"
  | "ECONOMIC_RECOVERY"
  | "ISLAND_FOOTPRINT"
  | "MILITARY_PRESSURE"
  | "BORDER_CONTAINMENT"
  | "SHARD_RUSH";

export type AiFrontPosture = "BREAK" | "CONTAIN" | "TRUCE";

export type AiStrategicState = {
  focus: AiStrategicFocus;
  frontPosture: AiFrontPosture;
  targetPlayerId?: string;
  weakestIslandRatio: number;
  undercoveredIslandCount: number;
  updatedAt: number;
};
