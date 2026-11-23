import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ENCIRCLEMENT_EMPIRE_FELL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Empire Fell notice after encirclement",
  why: "Players who lost their last land to encirclement got a quiet sign-in recovery instead of the wipe-out notice.",
  changes: [
    "Losing your last land to encirclement or cut-off frontier now shows the Empire Fell notice and sends the Empire Fell email, as an attack does."
  ]
};
