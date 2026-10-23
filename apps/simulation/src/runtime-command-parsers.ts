import type { ConverterMode, RetortTargetResource } from "@border-empires/shared";
import type { AetherWallDirection } from "./runtime-types.js";

export interface FrontierPayload {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  musterSourceX?: number;
  musterSourceY?: number;
  // docs/replenishment-update-plan.md D6: the player's chosen commitment for
  // a manual ATTACK, above the required floor. Ignored for EXPAND and for
  // barbarian-origin attacks (see validateFrontierCommand).
  commitManpower?: number;
}

export const parseFrontierPayload = (payloadJson: string): FrontierPayload | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) {
      return null;
    }
    return {
      fromX: parsed.fromX,
      fromY: parsed.fromY,
      toX: parsed.toX,
      toY: parsed.toY,
      ...(typeof parsed.musterSourceX === "number" ? { musterSourceX: parsed.musterSourceX } : {}),
      ...(typeof parsed.musterSourceY === "number" ? { musterSourceY: parsed.musterSourceY } : {}),
      ...(typeof parsed.commitManpower === "number" ? { commitManpower: parsed.commitManpower } : {})
    };
  } catch {
    return null;
  }
};

export const parseSettlePayload = (payloadJson: string): { x: number; y: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

export const parseTilePayload = (payloadJson: string): { x: number; y: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
};

export const parseStructureTilePayload = (payloadJson: string): { x: number; y: number } | null => parseTilePayload(payloadJson);
export const parseBuildAfcPayload = parseTilePayload;

export const parseConverterTogglePayload = (payloadJson: string): { x: number; y: number; enabled: boolean } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.enabled !== "boolean") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      enabled: parsed.enabled
    };
  } catch {
    return null;
  }
};

export const parseConverterModePayload = (payloadJson: string): { x: number; y: number; mode: ConverterMode } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.mode !== "string") return null;
    if (parsed.mode !== "SYNTHESIZE" && parsed.mode !== "EXCHANGE") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      mode: parsed.mode
    };
  } catch {
    return null;
  }
};

export const parseSetMusterPayload = (
  payloadJson: string
): { x: number; y: number; mode: "HOLD" | "ADVANCE" | "MARCH"; targetX?: number; targetY?: number; commitManpower?: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (parsed.mode !== "HOLD" && parsed.mode !== "ADVANCE" && parsed.mode !== "MARCH") return null;
    if (parsed.mode === "MARCH" && (typeof parsed.targetX !== "number" || typeof parsed.targetY !== "number")) return null;
    return {
      x: parsed.x,
      y: parsed.y,
      mode: parsed.mode,
      ...(typeof parsed.targetX === "number" ? { targetX: parsed.targetX } : {}),
      ...(typeof parsed.targetY === "number" ? { targetY: parsed.targetY } : {}),
      ...(typeof parsed.commitManpower === "number" ? { commitManpower: parsed.commitManpower } : {})
    };
  } catch {
    return null;
  }
};

export const parseClearMusterPayload = parseTilePayload;
// A present-but-invalid fitManpower is rejected rather than dropped: dropping
// it would turn a "fit if needed" request into a plain +1 Expand Capacity press.
export const parseUpgradeMusterCapPayload = (payloadJson: string): { x: number; y: number; fitManpower?: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    const { fitManpower } = parsed;
    if (fitManpower === undefined) return { x: parsed.x, y: parsed.y };
    return typeof fitManpower === "number" && Number.isFinite(fitManpower) && fitManpower > 0 ? { x: parsed.x, y: parsed.y, fitManpower } : null;
  } catch {
    return null;
  }
};

export const parseBuildStructurePayload = (payloadJson: string): { x: number; y: number; structureType: string } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.structureType !== "string") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      structureType: parsed.structureType
    };
  } catch {
    return null;
  }
};

export const parseRetortRecastPayload = (payloadJson: string): { x: number; y: number; targetResource: RetortTargetResource } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.targetResource !== "string") return null;
    return {
      x: parsed.x,
      y: parsed.y,
      targetResource: parsed.targetResource as RetortTargetResource
    };
  } catch {
    return null;
  }
};

export const parseRedeployAfcModulePayload = (payloadJson: string): { x: number; y: number; techId: string } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number" || typeof parsed.techId !== "string") return null;
    return { x: parsed.x, y: parsed.y, techId: parsed.techId };
  } catch { return null; }
};

export const parseRevealPayload = (payloadJson: string): { targetPlayerId: string } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.targetPlayerId !== "string" || parsed.targetPlayerId.length === 0) return null;
    return { targetPlayerId: parsed.targetPlayerId };
  } catch {
    return null;
  }
};

export const parseAllianceSyncPayload = (payloadJson: string): { targetPlayerId: string; allied: boolean } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.targetPlayerId !== "string" || parsed.targetPlayerId.length === 0 || typeof parsed.allied !== "boolean") {
      return null;
    }
    return { targetPlayerId: parsed.targetPlayerId, allied: parsed.allied };
  } catch {
    return null;
  }
};

export const parseTruceSyncPayload = (payloadJson: string): { targetPlayerId: string; truced: boolean } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.targetPlayerId !== "string" || parsed.targetPlayerId.length === 0 || typeof parsed.truced !== "boolean") {
      return null;
    }
    return { targetPlayerId: parsed.targetPlayerId, truced: parsed.truced };
  } catch {
    return null;
  }
};

export const parseAetherWallPayload = (
  payloadJson: string
): { x: number; y: number; direction: AetherWallDirection; length: 1 | 2 | 3 } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      (parsed.direction !== "N" && parsed.direction !== "E" && parsed.direction !== "S" && parsed.direction !== "W") ||
      (parsed.length !== 1 && parsed.length !== 2 && parsed.length !== 3)
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      direction: parsed.direction,
      length: parsed.length
    };
  } catch {
    return null;
  }
};

export const parseSkyDockBombardPayload = (payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) {
      return null;
    }
    return {
      fromX: parsed.fromX,
      fromY: parsed.fromY,
      toX: parsed.toX,
      toY: parsed.toY
    };
  } catch {
    return null;
  }
};

// §15: single target chosen by the caster (from's Imperial Exchange tile ->
// a rival-owned tile that identifies the target player), not the old
// "pick a resource, hit everyone" shape.
export const parseImperialExchangeLevyPayload = (payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) return null;
    return { fromX: parsed.fromX, fromY: parsed.fromY, toX: parsed.toX, toY: parsed.toY };
  } catch {
    return null;
  }
};

export const parseSovereignSiegeEngineStrikePayload = (payloadJson: string): { fromX: number; fromY: number; toX: number; toY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.fromX !== "number" ||
      typeof parsed.fromY !== "number" ||
      typeof parsed.toX !== "number" ||
      typeof parsed.toY !== "number"
    ) return null;
    return { fromX: parsed.fromX, fromY: parsed.fromY, toX: parsed.toX, toY: parsed.toY };
  } catch {
    return null;
  }
};

export const parseAegisLockPayload = (payloadJson: string): { fromX: number; fromY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.fromX !== "number" || typeof parsed.fromY !== "number") return null;
    return { fromX: parsed.fromX, fromY: parsed.fromY };
  } catch {
    return null;
  }
};

export const parseAstralDockLaunchPayload = (payloadJson: string): { fromX: number; fromY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.fromX !== "number" || typeof parsed.fromY !== "number") return null;
    return { fromX: parsed.fromX, fromY: parsed.fromY };
  } catch {
    return null;
  }
};

export const parseTitaniumLevyMusterPayload = (payloadJson: string): { fromX: number; fromY: number } | null => {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof parsed.fromX !== "number" || typeof parsed.fromY !== "number") return null;
    return { fromX: parsed.fromX, fromY: parsed.fromY };
  } catch {
    return null;
  }
};
