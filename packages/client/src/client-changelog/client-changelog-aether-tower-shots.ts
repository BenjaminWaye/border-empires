import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AETHER_TOWER_SHOTS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793285626442, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.2",
    title: "Aether Towers fire 3 shots a day",
    why: "Minute-long ability cooldowns rewarded staying online all day; a player who checks in a few times a day should get the same use out of their towers.",
    changes: [
      "Each Aether Tower now holds 3 shots. Every Aether ability cast from it (Purge, EMP, Wall, Bridge, Siphon, Survey Sweep, Reveal Empire Stats, terrain shaping, Retort Transmutation and tower suppression) spends one, instead of starting a cooldown.",
      "A spent shot comes back 24 hours after it was used. Select your tower to see how many shots it has left and when the next one returns.",
      "A tower keeps shielding your nearby land while it has a shot left, and stops only once all of them are spent.",
      "Resonance Governor now doubles every tower's shots to 6 per day instead of halving cooldowns.",
      "Starting a Siphon spends a shot. Cancelling it no longer adds a cooldown."
    ]
  }
];
