import { describe, expect, it } from "vitest";
import { playerManpowerRegenPerMinuteFromSummary } from "./runtime-manpower.js";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE } from "@border-empires/shared";

// Galactic meta-layer v0 Dyson Array stand-in (docs/galactic-campaign-design.md
// §5, §12): a one-time manpower-regen head start for the most recent
// season's Planet winner. See DomainPlayer.galacticWonderManpowerRegenBonusPerMinute.
describe("playerManpowerRegenPerMinuteFromSummary — galactic Wonder bonus (v0)", () => {
  it("adds the galactic Wonder bonus on top of the starting-capital baseline when no towns are owned", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    const withoutBonus = playerManpowerRegenPerMinuteFromSummary(summary, 0, 0, 0, 0);
    const withBonus = playerManpowerRegenPerMinuteFromSummary(summary, 0, 0, 0, GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE);
    expect(withoutBonus).toBe(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
    expect(withBonus).toBe(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE);
  });

  it("defaults to no bonus when the parameter is omitted", () => {
    const summary = createEmptyPlayerRuntimeSummary();
    expect(playerManpowerRegenPerMinuteFromSummary(summary)).toBe(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
  });
});
