import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOUSE_CRESTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Choose a House crest",
  why: "A House's emblem was only ever its first letter in a coloured square, with nothing to make it your own.",
  changes: [
    "Tap your emblem, then the emblem on your profile, to choose one of 12 crests (or keep your letter). Also in Settings → Account",
    "Your crest shows on your emblem in the HUD, Diplomacy, Ranks, the Chronicle and battles, to every House",
    "Looks only, and free"
  ]
};
