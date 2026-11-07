import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_STAT_BONUSES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794040994328, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Every town coin and manpower bonus written out",
    why: "Town stats hid the connected-town bonus and which town's Trade Nexus was powering it.",
    changes: [
      "The Coin card lists tier, connected towns (naming the Trade Nexus town), support, Mercantile Charter and building bonuses",
      "The Manpower card lists building manpower bonuses, and the HUD town screen shows the same coin bonuses"
    ]
  }
];
