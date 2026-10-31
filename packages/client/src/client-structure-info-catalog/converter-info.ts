import { CONVERTER_MODE_FLIP_COOLDOWN_MS, EXCHANGE_GOLD_PER_SLOT_PER_DAY } from "@border-empires/game-domain";
import type { StructureInfoKey } from "../client-map-display.js";

const sellOffRates: Readonly<Partial<Record<StructureInfoKey, number>>> = EXCHANGE_GOLD_PER_SLOT_PER_DAY;
export const converterInfoEffects = (kind: StructureInfoKey): string[] | undefined => {
  const rate = sellOffRates[kind];
  return rate === undefined ? undefined : [
    `Sell Off: 1 resource slot → ${rate} Coin/day`,
    `Mode changes have a cooldown of ${CONVERTER_MODE_FLIP_COOLDOWN_MS / 60_000} minutes`
  ];
};
