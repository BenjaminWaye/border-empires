import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TAP_TO_INSPECT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Tapping a tile on a phone shows it instead of claiming it",
  why: "On a phone, tapping a tile next to your border to look at it expanded into it at once and spent manpower, and Stage Muster and a march's Go gave no clear sign of what they did.",
  changes: [
    "On a touch screen, tapping unclaimed land next to your border opens its tile sheet. Press Expand To to claim it. With a mouse, one click still claims it straight away.",
    "The first time you press Stage Muster, a short note says what it does and how to get the manpower back. Confirm once and it acts at once from then on.",
    "Pressing Go on a march shows a March sent message with the manpower and the route."
  ]
};
