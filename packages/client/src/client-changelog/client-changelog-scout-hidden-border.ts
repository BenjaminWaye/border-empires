import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCOUT_HIDDEN_BORDER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Scout drone no longer gives away hidden borders",
  why: "Pressing Go cut a route short at a rival border still in fog, so the plan showed where that border was before the drone got anywhere near it.",
  changes: [
    "Your scout drone now keeps every stop you place, and only finds a rival border in fog when it flies up to it",
    "When a border turns it back, the stops past that border cost no charge",
    "On its way home it goes round rival land it meets instead of flying over it"
  ]
};
