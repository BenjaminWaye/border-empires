import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SHORT_PHONE_LAYOUT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Short phones: nothing hides under the tabs",
  why: "On short phones the Relay Beacon's Confirm sat under the tab bar, Settings opened under the top bar, and the guide covered the screens it sent you to.",
  changes: [
    "Placing a Relay Beacon, Hydroworks or AFC shows Cancel and Confirm in place of the tab bar",
    "Settings opens below the top bar, with its close button in view",
    "Over Manifest, Diplomacy and Manpower the guide is a short strip above the tabs and the screen ends above it",
    "Tips sit above the tab bar instead of on it",
    "Abandon Territory and the other small links sit above the big buttons, away from where the tabs were",
    "Centring the map on a tile keeps it clear of the tracker line under the top bar",
    "Town stat cards show two to a row, the Manifest tree gets more room, and long empire names stay on their Diplomacy card"
  ]
};
