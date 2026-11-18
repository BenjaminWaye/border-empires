import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PANEL_LAYOUT_DATA_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Panels that no longer overlap, and say what they mean",
  why: "Playtesters saw text over the Manifest's Commission button, a map label through the Diplomacy title, the tracker over Victory race and a Build list over a town's stats. Some panels also gave wrong or unexplained numbers.",
  changes: [
    "The Manifest's Commission button stays solid when the details scroll under it on a phone",
    "Screen titles sit on a near-solid backdrop, so map labels no longer show through them",
    "On a phone the folded tracker stops short of Victory race",
    "The map's Build list closes under any open screen instead of covering the town screen",
    "Food says to garrison grain or fish sites (with Find on map) instead of \"No tiles yet\", and never shows no sources beside a Food supply",
    "A town earning 0 coin says why: unfed, no plots garrisoned, sabotaged or not garrisoned",
    "A town's details no longer show it as fed just because your food stores are full",
    "Opening the Chronicle clears its button badge; the Updates tab keeps its own count",
    "The Empire Integrity panel leads with the score and its income effect",
    "Waystation Discovered never shows after the same Waystation's Activated card"
  ]
};
