import type { DurableCommandType } from "@border-empires/client-protocol";

type GatewayCommandMessage = { type: string; x?: number; y?: number; techId?: string; targetPlayerId?: string };
type DispatchDurableCommand = (type: DurableCommandType, payload: Record<string, unknown>, withMetadata?: boolean) => Promise<void>;

export const dispatchAfcOrRevealCommand = async (message: GatewayCommandMessage, dispatch: DispatchDurableCommand): Promise<boolean> => {
  if (message.type === "REVEAL_EMPIRE" && message.targetPlayerId) {
    await dispatch("REVEAL_EMPIRE", { targetPlayerId: message.targetPlayerId }, true);
    return true;
  }
  if (message.type === "REVEAL_EMPIRE_STATS" && message.targetPlayerId) {
    await dispatch("REVEAL_EMPIRE_STATS", { targetPlayerId: message.targetPlayerId }, true);
    return true;
  }
  if (typeof message.x !== "number" || typeof message.y !== "number") return false;
  if (message.type === "REDEPLOY_AFC_MODULE" && message.techId) {
    await dispatch("REDEPLOY_AFC_MODULE", { x: message.x, y: message.y, techId: message.techId }, true);
    return true;
  }
  if (message.type !== "BUILD_AFC") return false;
  await dispatch("BUILD_AFC", { x: message.x, y: message.y }, true);
  return true;
};
