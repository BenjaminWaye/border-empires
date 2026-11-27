import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOUSE_CRESTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Choose a House crest",
  why: "A House's emblem was only ever its first letter in a coloured square, with nothing to make it your own.",
  changes: [
    "Choose one of 12 crests (or keep your letter) beside your name and colour, with a preview. Tap the emblem on your profile, or Settings → Account",
    "Your crest shows on your emblem in the HUD, Diplomacy, Ranks, the Chronicle and battles, to every House. On the 3D map it is on your muster flags too; the 2D map shows it only on your own besieged flag's pennant",
    "Looks only, and free"
  ]
};
