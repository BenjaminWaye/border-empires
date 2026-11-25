import type { DurableCommandType } from "@border-empires/client-protocol";

// SET_TOWN_FOCUS (docs/town-focus-plan.md), schema-parsed upstream and passed
// through; the simulation checks ownership and bounds the write.
type GatewayTownFocusMessage = { type: string; tiles?: ReadonlyArray<{ x: number; y: number }>; focus?: string };
type DispatchDurableCommand = (type: DurableCommandType, payload: Record<string, unknown>, withMetadata?: boolean) => Promise<void>;

export const dispatchTownFocusCommand = async (message: GatewayTownFocusMessage, dispatch: DispatchDurableCommand): Promise<boolean> => {
  if (message.type !== "SET_TOWN_FOCUS" || !message.tiles || typeof message.focus !== "string") return false;
  await dispatch("SET_TOWN_FOCUS", { tiles: message.tiles.map(({ x, y }) => ({ x, y })), focus: message.focus }, true);
  return true;
};
