import type { AiSeasonVictoryPathId } from "./goap.js";

export type AiStrategicAbilityCandidate = {
  tileIndex: number;
  isTown: boolean;
  isDock: boolean;
  supportedTownCount: number;
  supportedDockCount: number;
  connectedTownCount: number;
  connectedDockCount: number;
  borderPressure: number;
};

export type AiStrategicActionTarget = {
  tileIndex: number;
  score: number;
};

export type AiStrategicPlayerTarget = {
  playerId: string;
  score: number;
};

export type AiStrategicRequestTarget = {
  requestId: string;
  playerId: string;
  score: number;
};

export type AiStrategicAbilityContext = {
  primaryVictoryPath?: AiSeasonVictoryPathId;
  strategicFocus:
    | "BALANCED"
    | "ECONOMIC_RECOVERY"
    | "ISLAND_FOOTPRINT"
    | "MILITARY_PRESSURE"
    | "BORDER_CONTAINMENT"
    | "SHARD_RUSH";
  frontPosture: "BREAK" | "CONTAIN" | "TRUCE";
  underThreat: boolean;
  threatCritical: boolean;
  economyWeak: boolean;
  foodCoverageLow: boolean;
  pressureThreatensCore: boolean;
  canBuildObservatory: boolean;
  hasActiveObservatory: boolean;
  canRevealEmpire: boolean;
  revealAlreadyActive: boolean;
  canCastAetherBridge: boolean;
  canSiphonTile: boolean;
  canAcceptAlliance: boolean;
  canRequestAlliance: boolean;
  targetPlayerId?: string;
  targetLeading: boolean;
};

export type AiStrategicAbilityDecision =
  | { kind: "build_observatory"; tileIndex: number; reason: string; score: number }
  | { kind: "reveal_empire"; targetPlayerId: string; reason: string; score: number }
  | { kind: "cast_aether_bridge"; tileIndex: number; reason: string; score: number }
  | { kind: "siphon_tile"; tileIndex: number; reason: string; score: number }
  | { kind: "accept_alliance"; requestId: string; playerId: string; reason: string; score: number }
  | { kind: "request_alliance"; playerId: string; reason: string; score: number }
  | undefined;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const scoreAiObservatoryCandidate = (candidate: AiStrategicAbilityCandidate): number =>
  (candidate.isTown ? 115 : 0) +
  (candidate.isDock ? 95 : 0) +
  candidate.supportedTownCount * 42 +
  candidate.supportedDockCount * 56 +
  candidate.connectedTownCount * 18 +
  candidate.connectedDockCount * 34 +
  clamp(candidate.borderPressure, 0, 4) * 18;

const bestByScore = <T extends { score: number }>(options: T[]): T | undefined => {
  let best: T | undefined;
  for (const option of options) {
    if (!best || option.score > best.score) best = option;
  }
  return best;
};

export const chooseAiStrategicAbility = (
  ctx: AiStrategicAbilityContext,
  observatoryCandidates: AiStrategicAbilityCandidate[],
  bridgeTargets: AiStrategicActionTarget[] = [],
  siphonTargets: AiStrategicActionTarget[] = [],
  allianceRequests: AiStrategicRequestTarget[] = [],
  allianceTargets: AiStrategicPlayerTarget[] = []
): AiStrategicAbilityDecision => {
  const bestObservatory = bestByScore(
    observatoryCandidates.map((candidate) => ({
      tileIndex: candidate.tileIndex,
      score: scoreAiObservatoryCandidate(candidate)
    }))
  );
  const bestBridge = bestByScore(bridgeTargets);
  const bestSiphon = bestByScore(siphonTargets);
  const bestAllianceRequest = bestByScore(allianceRequests);
  const bestAllianceTarget = bestByScore(allianceTargets);

  const observatoryScore =
    ctx.canBuildObservatory && bestObservatory
      ? bestObservatory.score +
        (ctx.hasActiveObservatory ? -36 : 36) +
        (ctx.underThreat ? -24 : 16) +
        (ctx.foodCoverageLow ? -12 : 0) +
        (ctx.strategicFocus === "SHARD_RUSH" || ctx.strategicFocus === "ECONOMIC_RECOVERY" ? 12 : 0)
      : Number.NEGATIVE_INFINITY;

  const revealScore =
    ctx.canRevealEmpire && !ctx.revealAlreadyActive && ctx.targetPlayerId
      ? 118 +
        (ctx.targetLeading ? 32 : 0) +
        (ctx.primaryVictoryPath === "TOWN_CONTROL" ? 18 : 0) +
        (ctx.frontPosture === "BREAK" ? 12 : 0) +
        (ctx.strategicFocus === "MILITARY_PRESSURE" ? 16 : 0) +
        (ctx.economyWeak ? -12 : 0) +
        (ctx.threatCritical || ctx.pressureThreatensCore ? -22 : 0)
      : Number.NEGATIVE_INFINITY;

  const bridgeScore =
    ctx.canCastAetherBridge && bestBridge
      ? bestBridge.score +
        (ctx.strategicFocus === "ISLAND_FOOTPRINT" ? 34 : 0) +
        (ctx.primaryVictoryPath === "SETTLED_TERRITORY" ? 28 : 0) +
        (ctx.frontPosture === "BREAK" ? 12 : 0) +
        (ctx.hasActiveObservatory ? 8 : 0) +
        (ctx.pressureThreatensCore ? -28 : 0)
      : Number.NEGATIVE_INFINITY;

  const siphonScore =
    ctx.canSiphonTile && bestSiphon
      ? bestSiphon.score +
        (ctx.strategicFocus === "MILITARY_PRESSURE" ? 26 : 0) +
        (ctx.targetLeading ? 18 : 0) +
        (ctx.frontPosture === "BREAK" ? 12 : 0) +
        (ctx.economyWeak ? 8 : 0) +
        (ctx.threatCritical ? -16 : 0)
      : Number.NEGATIVE_INFINITY;

  const acceptAllianceScore =
    ctx.canAcceptAlliance && bestAllianceRequest
      ? bestAllianceRequest.score +
        (ctx.underThreat ? 28 : 0) +
        (ctx.economyWeak ? 22 : 0) +
        (ctx.frontPosture === "CONTAIN" || ctx.frontPosture === "TRUCE" ? 18 : 0) +
        (ctx.targetLeading ? 12 : 0)
      : Number.NEGATIVE_INFINITY;

  const requestAllianceScore =
    ctx.canRequestAlliance && bestAllianceTarget
      ? bestAllianceTarget.score +
        (ctx.underThreat ? 26 : 0) +
        (ctx.economyWeak ? 18 : 0) +
        (ctx.frontPosture === "CONTAIN" || ctx.frontPosture === "TRUCE" ? 14 : 0) +
        (ctx.targetLeading ? 10 : 0)
      : Number.NEGATIVE_INFINITY;

  const options = [
    { kind: "build_observatory" as const, score: observatoryScore },
    { kind: "reveal_empire" as const, score: revealScore },
    { kind: "cast_aether_bridge" as const, score: bridgeScore },
    { kind: "siphon_tile" as const, score: siphonScore },
    { kind: "accept_alliance" as const, score: acceptAllianceScore },
    { kind: "request_alliance" as const, score: requestAllianceScore }
  ].sort((left, right) => right.score - left.score);

  const best = options[0];
  if (!best || best.score < 120) return undefined;

  switch (best.kind) {
    case "build_observatory":
      if (!bestObservatory) return undefined;
      return {
        kind: "build_observatory",
        tileIndex: bestObservatory.tileIndex,
        reason: "strategic_observatory_build",
        score: best.score
      };
    case "reveal_empire":
      if (!ctx.targetPlayerId) return undefined;
      return {
        kind: "reveal_empire",
        targetPlayerId: ctx.targetPlayerId,
        reason: "strategic_reveal_empire",
        score: best.score
      };
    case "cast_aether_bridge":
      if (!bestBridge) return undefined;
      return {
        kind: "cast_aether_bridge",
        tileIndex: bestBridge.tileIndex,
        reason: "strategic_aether_bridge",
        score: best.score
      };
    case "siphon_tile":
      if (!bestSiphon) return undefined;
      return {
        kind: "siphon_tile",
        tileIndex: bestSiphon.tileIndex,
        reason: "strategic_siphon_tile",
        score: best.score
      };
    case "accept_alliance":
      if (!bestAllianceRequest) return undefined;
      return {
        kind: "accept_alliance",
        requestId: bestAllianceRequest.requestId,
        playerId: bestAllianceRequest.playerId,
        reason: "strategic_accept_alliance",
        score: best.score
      };
    case "request_alliance":
      if (!bestAllianceTarget) return undefined;
      return {
        kind: "request_alliance",
        playerId: bestAllianceTarget.playerId,
        reason: "strategic_request_alliance",
        score: best.score
      };
  }
};
