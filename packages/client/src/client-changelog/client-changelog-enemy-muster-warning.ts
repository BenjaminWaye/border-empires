import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ENEMY_MUSTER_WARNING_CHANGELOG: ClientChangelogEntry = {
    createdAt: 1792044007050, // Date.now() frozen for the changelog gate.
    introducedIn: "2026.10.15.1",
    title: "Warnings for enemy muster flags near your border",
    why: "An enemy could stage troops on a muster flag right next to your land, and you only found out once the attack landed.",
    changes: [
      "A warning pops up when an enemy muster flag appears within 4 tiles of your territory, or an existing one switches to Advance or March, with a button to center on it",
      "Enemy flags near your border get a red off-screen pointer in both map renderers, ahead of your own alerts while still leaving room for them",
      "Flags of allies and truce partners don't trigger warnings"
    ]
  };

export const FRONTIER_REACH_WARNING_CHANGELOG: ClientChangelogEntry = {
    createdAt: 1791970358363, // Date.now() frozen for the changelog gate.
    introducedIn: "2026.10.14.3",
    title: "Enemy frontier warnings refer to their owner's reach",
    why: "An enemy tile's decay timer incorrectly said beyond your reach even when it was within yours.",
    changes: ["Enemy frontier decay warnings now refer to the tile owner's reach in both map renderers"]
  };
