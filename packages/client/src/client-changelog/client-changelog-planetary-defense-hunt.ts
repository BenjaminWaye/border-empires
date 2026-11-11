import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLANETARY_DEFENSE_HUNT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Hunt Planetary Defense",
  why: "Fighting Planetary Defense was frustrating: your company only set off once it had marched from the flag, so the patrol had usually moved on and the attack failed with \"target must be enemy-controlled land\". While a patrol was capturing your tile there was nothing to attack at all, and on many devices the patrolling soldiers had stopped walking around.",
  changes: [
    "Muster flags have a new Hunt Planetary Defense order: the flag goes after Planetary Defense within 10 steps, leaves other empires alone, chases a patrol that moves, and reports back once the area is clear",
    "Attacking a Planetary Defense tile now sends the holding flag that pays for the attack hunting, starting with the tile you picked. The attack goes out within about a second and pins the patrol, so it can no longer walk away while your company marches",
    "When Planetary Defense is capturing one of your tiles, the tile offers Hunt Planetary Defense: a nearby flag strikes the patrol the moment it lands",
    "Planetary Defense soldiers keep patrolling on devices running the 3D map at 30fps; they only stand still on a device that is really struggling, or with Reduce Motion on"
  ]
};
