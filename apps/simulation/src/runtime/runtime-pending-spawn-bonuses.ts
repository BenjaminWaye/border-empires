import { GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE, GALACTIC_WONDER_VISION_RADIUS_BONUS } from "@border-empires/shared";
import type { RuntimePlayer } from "../runtime-types.js";

/**
 * Season-start bonuses held until their player first spawns territory in the
 * new season: the Emperor-endorsement Imperial Ward charges (galaxy meta-layer
 * Phase 1) and the last season's Planet winner's Wonder-style starting bonus
 * (§5, §12). Each is applied once, then dropped.
 */
export class PendingSpawnBonuses {
  private imperialWard: { playerId: string; charges: number } | undefined;
  private galacticWonder: { playerId: string } | undefined;

  constructor(options: { imperialWard?: { playerId: string; charges: number } | undefined; galacticWonder?: { playerId: string } | undefined }) {
    this.imperialWard = options.imperialWard;
    this.galacticWonder = options.galacticWonder;
  }

  /** Applies whichever bonuses belong to `playerId` onto `player`, and consumes them. */
  applyTo(playerId: string, player: RuntimePlayer | undefined): void {
    if (this.imperialWard?.playerId === playerId) {
      if (player) player.imperialWardCharges = this.imperialWard.charges;
      this.imperialWard = undefined;
    }
    if (this.galacticWonder?.playerId === playerId) {
      if (player) {
        player.galacticWonderManpowerRegenBonusPerMinute = GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE;
        player.galacticWonderVisionRadiusBonus = GALACTIC_WONDER_VISION_RADIUS_BONUS;
      }
      this.galacticWonder = undefined;
    }
  }
}
