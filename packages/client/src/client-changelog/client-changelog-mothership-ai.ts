import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MOTHERSHIP_AI_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Relay Beacons relay your Mothership's AI",
  why: "The Relay Beacon text spoke of a \"House AI\", easy to confuse with the computer-run Houses you play against.",
  changes: [
    "The Relay Beacon tooltip and building info now say the beacon relays your Mothership AI's command signal to your ancillaries",
    "Nothing about reach or vision changes"
  ]
};
