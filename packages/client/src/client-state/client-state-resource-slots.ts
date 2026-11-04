import { createInitialResourceTradeState } from "../client-diplomacy-trade/client-resource-trade-state.js";
import type { NetworkSupplyStatus, SlotResource } from "@border-empires/shared";

export const createInitialResourceSlots = (): {
  supply: Record<SlotResource, number>; demand: Record<SlotResource, number>; bonusSupply?: NetworkSupplyStatus; sources?: import("@border-empires/shared").ResourceSlotSources;
} => ({ supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } });

export const createInitialResourceEconomyState = () => ({
  resourceSlots: createInitialResourceSlots(),
  ...createInitialResourceTradeState(),
  dormantStructures: [] as Array<{ key: string; resources: SlotResource[] }>
});
