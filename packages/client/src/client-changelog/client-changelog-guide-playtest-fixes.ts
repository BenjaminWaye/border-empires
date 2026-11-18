import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_PLAYTEST_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "The guide marks food you can garrison and no longer skips steps",
  why: "New players got stuck on the guide: it marked food tiles outside their reach that couldn't be garrisoned, jumped ahead after a Waystation's free Manifest, and hid its target under the card on phones.",
  changes: [
    "The food step only marks grain and fish inside your reach. If none are, it asks for a Relay Beacon to extend your reach.",
    "A free Manifest from a Waystation no longer counts as commissioning one, so the Manifest and Build steps still show.",
    "The card shows how many steps are done, and lists chapters that start later, such as Contest and Diplomacy.",
    "If you skipped the town step, the Manufactory step asks you to take a town first and marks one.",
    "On a phone, Show me folds the card away so the marked tile isn't hidden under it.",
    "The last step points to the Chronicle, and Finish shows a Guide complete card."
  ]
};
