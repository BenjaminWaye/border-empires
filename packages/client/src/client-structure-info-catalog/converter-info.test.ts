import { describe, expect, it } from "vitest";
import { CONVERTER_MODE_FLIP_COOLDOWN_MS, EXCHANGE_GOLD_PER_SLOT_PER_DAY } from "@border-empires/game-domain";
import { structureInfoForKey, type StructureInfoKey } from "../client-map-display.js";
const deps = { formatCooldownShort: (ms: number) => String(ms), prettyToken: (text: string) => text };
describe("converter build information", () => {
  for (const [kind, rate] of Object.entries(EXCHANGE_GOLD_PER_SLOT_PER_DAY)) {
    it(`shows both Sell Off payout and flip lock for ${kind}`, () => {
      const info = structureInfoForKey(kind as StructureInfoKey, deps), text = `${info.detail} ${info.effects.join(" ")}`;
      expect(text).toContain(`${rate} Coin/day`);
      expect(text).toContain(`${CONVERTER_MODE_FLIP_COOLDOWN_MS / 60_000} minutes`);
    });
  }
});
