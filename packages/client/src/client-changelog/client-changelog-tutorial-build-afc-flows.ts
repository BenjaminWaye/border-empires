import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TUTORIAL_BUILD_AFC_FLOWS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793884450962, // Date.now() captured once for this entry.
    introducedIn: "2026.11.05",
    title: "Clearer tutorial building and AFC upgrades",
    why: "The guide could disappear in Manpower, suggest a Manufactory with no spare food, and leave important menu actions hard to find.",
    changes: [
      "The guide stays visible in Manpower and highlights Manufactory, then Place, in the town build menu",
      "Town build menus open on Town Support; the guide asks you to free food capacity before building a Manufactory",
      "Resource clues link to the Manifest needed to reveal their deposits",
      "Your AFC always offers an upgrades shortcut, with ready upgrades taking priority over Relay Beacon construction"
    ]
  }
];
