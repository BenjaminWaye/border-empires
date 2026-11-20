import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAYSTATION_OWNED_TOAST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Waystation prompt only on your tiles",
  why: "The Activate card floated above every visible waystation, including ones you had not claimed yet or that a rival held.",
  changes: [
    "The Activate card now appears above a waystation only once you have claimed its tile."
  ]
};
