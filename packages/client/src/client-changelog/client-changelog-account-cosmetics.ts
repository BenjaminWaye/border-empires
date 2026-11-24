import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACCOUNT_COSMETICS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Groundwork for the High-noble standard and the Lancet guard",
  why: "A House will be able to fly a gilded muster flag and field hooded Lancet guards that every rival sees. They change looks only, never how the game plays.",
  changes: [
    "An account that owns the High-noble standard or the Lancet guard can choose it under Settings, Account",
    "Other Houses see it on that House's muster flags, or on its soldiers in battle, on the march and in its expand crew",
    "With a Titanium Weapons Factory the Lancet guard wears titanium plate, so rivals can always read that strength",
    "Neither is on sale yet, and nothing changes for an account that owns neither"
  ]
};
