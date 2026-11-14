import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PLACEMENT_CONFIRM_PHONE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Relay Beacons can be placed on phones again",
  why: "On a phone the placement bar sat behind the bottom tab bar, so its Confirm and Cancel buttons could not be tapped and a Relay Beacon could never be placed.",
  changes: [
    "While placing a Relay Beacon, Hydroworks or AFC on a phone, the Confirm and Cancel buttons now sit above the tab bar and the manpower orb.",
    "The placement hint wraps onto its own line instead of running off the screen."
  ]
};
