import { combatWinChance } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import {
  FORTIFIED_TILE_WITHOUT_OUTPOST_ATTACK_MULT,
  fortDefenseMultiplier,
  fortifiedTargetAttackMultiplier,
  outpostAttackMultiplier
} from "./fort-combat-balance.js";

describe("fort combat balance", () => {
  it("makes forts much harder to crack than ordinary tiles", () => {
    expect(
      fortDefenseMultiplier({
        hasFort: true,
        hasWoodenFort: false,
        fortDefenseEffectsMult: 1
      })
    ).toBe(2.25);

    expect(
      fortDefenseMultiplier({
        hasFort: false,
        hasWoodenFort: true,
        fortDefenseEffectsMult: 1
      })
    ).toBe(1.35);
  });

  it("boosts outpost-led attacks with siege outposts still strongest", () => {
    expect(
      outpostAttackMultiplier({
        hasSiegeOutpost: true,
        hasLightOutpost: false,
        outpostAttackEffectsMult: 1
      })
    ).toBe(1.6);

    expect(
      outpostAttackMultiplier({
        hasSiegeOutpost: false,
        hasLightOutpost: true,
        outpostAttackEffectsMult: 1
      })
    ).toBe(1.25);
  });

  it("heavily penalizes attacks into fortified tiles without an outpost", () => {
    expect(
      fortifiedTargetAttackMultiplier({
        targetHasFortification: true,
        originHasOutpost: false
      })
    ).toBe(FORTIFIED_TILE_WITHOUT_OUTPOST_ATTACK_MULT);

    expect(
      fortifiedTargetAttackMultiplier({
        targetHasFortification: true,
        originHasOutpost: true
      })
    ).toBe(1);
  });

  it("pushes even-stat fort attacks near unwinnable without an outpost", () => {
    const attackBase = 10;
    const fortDefenseBase =
      attackBase *
      fortDefenseMultiplier({
        hasFort: true,
        hasWoodenFort: false,
        fortDefenseEffectsMult: 1
      });

    const unsupportedWinChance = combatWinChance(
      attackBase *
        fortifiedTargetAttackMultiplier({
          targetHasFortification: true,
          originHasOutpost: false
        }),
      fortDefenseBase
    );

    const siegeSupportedWinChance = combatWinChance(
      attackBase *
        outpostAttackMultiplier({
          hasSiegeOutpost: true,
          hasLightOutpost: false,
          outpostAttackEffectsMult: 1
        }),
      fortDefenseBase
    );

    expect(unsupportedWinChance).toBeLessThan(0.15);
    expect(siegeSupportedWinChance).toBeGreaterThan(0.4);
  });
});
