import type { DurableCommandType } from "@border-empires/client-protocol";

// BUILD_ECONOMIC_STRUCTURE (with a refinery's optional field) and
// ASSIGN_REFINERY_FIELD, passed through to the simulation, which validates
// the field (docs/territory-development-plan.md, Phase 2).
type GatewayEconomicMessage = { type: string; x?: number | undefined; y?: number | undefined; structureType?: string | undefined; fieldX?: number | undefined; fieldY?: number | undefined };
type DispatchDurableCommand = (type: DurableCommandType, payload: Record<string, unknown>, withMetadata?: boolean) => Promise<void>;

const fieldOf = (message: GatewayEconomicMessage): { fieldX: number; fieldY: number } | undefined =>
  typeof message.fieldX === "number" && typeof message.fieldY === "number" ? { fieldX: message.fieldX, fieldY: message.fieldY } : undefined;

export const dispatchEconomicBuildOrRefineryCommand = async (message: GatewayEconomicMessage, dispatch: DispatchDurableCommand): Promise<boolean> => {
  if (message.type === "BUILD_ECONOMIC_STRUCTURE") {
    await dispatch("BUILD_ECONOMIC_STRUCTURE", { x: message.x, y: message.y, structureType: message.structureType, ...fieldOf(message) });
    return true;
  }
  const field = fieldOf(message);
  if (message.type !== "ASSIGN_REFINERY_FIELD" || typeof message.x !== "number" || typeof message.y !== "number" || !field) return false;
  await dispatch("ASSIGN_REFINERY_FIELD", { x: message.x, y: message.y, ...field }, true);
  return true;
};
