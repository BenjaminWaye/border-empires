import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RELIC_AETHER_WAKE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Working relics give themselves away",
  why: "Relics were easy to take and then quietly held: a House deep behind its own borders could run one all season and nobody knew.",
  changes: [
    "A relic garrisoned and still working gives off an aether wake that every other House sees: a tall column in the owning House's colour, even through fog and unexplored ground, and a violet marker on the minimap.",
    "The wake shows where the relic is and who holds it, never what kind of installation it is or what it has left.",
    "A relic held only as frontier, or used up, gives no wake. Your own relics show no wake on your map."
  ]
};
