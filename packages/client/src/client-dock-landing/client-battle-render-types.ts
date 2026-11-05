import type { GarrisonFacing } from "../client-map-3d-popup-marine/popup-marine-garrison.js";
import type { SquadGearFields } from "../client-map-3d-popup-marine/popup-marine-gear.js";
import type { DockLanding } from "./client-dock-landing.js";

export type BattleOverlayRenderEntry = {
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
  defenderColor: string;
  attackerWon: boolean;
  startAt: number;
  clashAt: number;
  endAt: number;
  // When true the battle continues a pre-resolution skirmish that already
  // shed WINNER_DEATHS marines per side during its first firefight cycle —
  // those marines stay collapsed rather than re-falling, and only the
  // loser's remaining deaths emerge over the battle's own firefight window.
  fromSkirmish: boolean;
  // Stable per-tile hash seed (target tile coordinates), NOT an array index
  // — must be derived the same way a preceding skirmish's hashSeed was, so a
  // resolved battle picking up from a skirmish keeps every marine's
  // offset/perp/fire-schedule identical across the transition.
  hashSeed: number;
  // An active siege structure of the attacker's is in range of the target
  // (client-siege-battle-targets.ts): only then does the opening lance play.
  siegeBoosted?: boolean;
  // Target tile is capture-held: its garrison defends (popup-marine-garrison.ts).
  defenderGarrison?: GarrisonFacing;
} & SquadGearFields & { landing?: DockLanding };

// A siege still counting down — outcome unknown. Plays the same cover-
// >advance approach as a resolved battle, then indefinite firefight-
// oscillation at the tile center with muzzle flashes and first-cycle
// casualties (WINNER_DEATHS per side), but no rout phase.
export type BattleOverlaySkirmishEntry = {
  /** A frontier landing with no defending force: unload and hold, without a firefight. */
  unopposed?: boolean;
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
  defenderColor: string;
  startAt: number;
  hashSeed: number;
  // Defender skirmish: hold the approach plateau open past the default
  // APPROACH_MS until the attacker's REAL (mechanical) transit delay
  // elapses, so a defender sees "company still approaching" for the actual
  // travel window rather than the firefight starting before the attacker's
  // troops have even arrived — see client-map-3d-capture-overlays.ts's
  // syncBattleOverlayFx for where this is computed.
  holdApproachUntilElapsed?: number;
  // See BattleOverlayRenderEntry.siegeBoosted.
  siegeBoosted?: boolean;
  // See BattleOverlayRenderEntry.defenderGarrison.
  defenderGarrison?: GarrisonFacing;
} & SquadGearFields & { landing?: DockLanding };

