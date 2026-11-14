import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FIRST_DOCK_CARD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Docks explained",
  why: "Players took docks without learning what a sea crossing can do, and waypoints into the sea just stopped.",
  changes: [
    "The first time you hold a dock, a card explains its sea lane: expand or attack across to the linked dock and the beach around it.",
    "A waypoint that ends at water now reminds you that every island has a dock with a sea lane to another island."
  ]
};
