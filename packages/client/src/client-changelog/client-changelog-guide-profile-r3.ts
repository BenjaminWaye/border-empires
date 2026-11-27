import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_PROFILE_R3_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Quieter guide, clearer profile",
  why: "Playtesters saw the guide card pop back over the map after every alert, got no link from Share profile, feared Edit Name would wipe their name, and saw their score drop after capturing land.",
  changes: [
    "The guide card folds to its \"?\" after an alert closes, and opens again on the next step",
    "\"Drag the map\" and \"Zoom\" tick off once you're past them",
    "Share profile copies the link, shows it and says \"Link copied\"",
    "Name, colour and crest each change once per Sector Contest; the dialog shows what's left and locks a used one",
    "An empty name box reads \"Blank keeps name\"",
    "Changing your crest now asks first",
    "Your profile's Score shows its parts: garrisoned tiles, coin and Manifests. Frontier scores once garrisoned"
  ]
};
