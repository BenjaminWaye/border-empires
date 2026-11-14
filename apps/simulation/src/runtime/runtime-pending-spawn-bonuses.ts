import { GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE, GALACTIC_WONDER_VISION_RADIUS_BONUS } from "@border-empires/shared";
import type { RuntimePlayer } from "../runtime-types.js";

/**
 * Season-start bonuses held until their player first spawns territory in the
 * new season: the last season's Planet winner's Wonder-style starting bonus
 * (§5, §12). Applied once, then dropped.
 */
export class PendingSpawnBonuses {
  private galacticWonder: { playerId: string } | undefined;

  constructor(options: { galacticWonder?: { playerId: string } | undefined }) {
    this.galacticWonder = options.galacticWonder;
  }

  /** Applies the bonus if it belongs to `playerId` onto `player`, and consumes them. */
  applyTo(playerId: string, player: RuntimePlayer | undefined): void {
    if (this.galacticWonder?.playerId === playerId) {
      if (player) {
        player.galacticWonderManpowerRegenBonusPerMinute = GALACTIC_WONDER_MANPOWER_REGEN_BONUS_PER_MINUTE;
        player.galacticWonderVisionRadiusBonus = GALACTIC_WONDER_VISION_RADIUS_BONUS;
      }
      this.galacticWonder = undefined;
    }
  }
}
