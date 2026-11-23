import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const VISIT_AGENDA_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "The Chronicle lists what is worth doing now",
  why: "A visit should offer a few real decisions instead of leaving you to hunt for them.",
  changes: [
    "The Ahead tab opens with up to five things worth doing now, most pressing first: manpower full or about to overflow, towns not garrisoned or unfed, towns that can be upgraded, a Manifest or AFC upgrade you can pay for, and free development slots with nothing queued.",
    "Tap a row to go to the place to act: the town's tile and its menu, or the Towns, Manifest, AFC or Manpower screen."
  ]
};
