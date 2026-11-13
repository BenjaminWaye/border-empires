import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PHONE_LAYOUT_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Phone screens fit short phones",
  why: "On a 667px-tall phone some cards ran off the screen, and one could lock the game until a restart.",
  changes: [
    "The Town captured card fits the screen: its middle scrolls, Jump to Town stays at the foot, and ✕ and Esc close it.",
    "Building info cards no longer run off the right edge.",
    "The Manpower, Economy and other panels stop above the tab bar, so their last rows (such as Active muster flags) can be reached.",
    "The Build and Aether sheets on the map have a ✕.",
    "A town's build list scrolls into view above its action buttons.",
    "The Chronicle opens taller on short phones.",
    "Phones no longer show keyboard hints such as \"Esc\" on buttons."
  ]
};
