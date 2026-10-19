import type { CrystalTargetingAbility } from "../client-types.js";
import { createGarrisonManyState, type GarrisonManyState } from "../client-garrison-many/client-garrison-many-model.js";

type TileCoord = { x: number; y: number };
type ArrowGesture = { origin: TileCoord; target: TileCoord };
export type InitialTargetingState = {
  buildingPlacement: { active: boolean; structureType: "HYDROWORKS" | "ORE_REFINERY" | "AFC" | "RELAY_BEACON" | ""; x: number; y: number };
  crystalTargeting: { active: boolean; ability: CrystalTargetingAbility; validTargets: Set<string>; originByTarget: Map<string, string> };
  aetherWallTargeting: { active: boolean; validOrigins: Set<string>; direction: "N" | "E" | "S" | "W"; length: 1 | 2 | 3 };
  skyDockTargeting: { active: boolean; originKey: string; validTargets: Set<string> };
  musterMarchTargeting: { active: boolean; originX: number; originY: number };
  winChancePaint: { targetX: number; targetY: number; expiresAt: number; entries: { x: number; y: number; winChance: number; color: string }[] } | undefined;
  arrowGesture: ArrowGesture | undefined;
  pendingArrowGestureConfirm: ArrowGesture | undefined;
  garrisonMany: GarrisonManyState;
};

export const createInitialTargetingState = (): InitialTargetingState => ({
  buildingPlacement: { active: false, structureType: "", x: 0, y: 0 },
  crystalTargeting: { active: false, ability: "aether_bridge", validTargets: new Set<string>(), originByTarget: new Map<string, string>() },
  aetherWallTargeting: { active: false, validOrigins: new Set<string>(), direction: "N", length: 1 },
  skyDockTargeting: { active: false, originKey: "", validTargets: new Set<string>() },
  musterMarchTargeting: { active: false, originX: 0, originY: 0 },
  // Temporary combat-target visuals, never persisted with game state.
  winChancePaint: undefined,
  arrowGesture: undefined,
  pendingArrowGestureConfirm: undefined,
  garrisonMany: createGarrisonManyState()
});
