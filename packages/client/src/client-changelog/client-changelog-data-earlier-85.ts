import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_85: ClientChangelogEntry[] = [
  {
    createdAt: 1789839014182, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.19.1",
    title: "New empire checklist now opens automatically for new players",
    why: "The onboarding checklist (find a town, expand to it, find food tiles, expand to them) was collapsed by default behind an unlabeled flag icon at bottom-left, so a brand-new player had no obvious reason to click it -- the entire tutorial was invisible unless you happened to tap the icon.",
    changes: [
      "The new empire checklist panel now starts open so new players see their goals right away",
      "It automatically collapses back to the small icon the first time any goal is completed, so it doesn't stay open over the map for the rest of onboarding",
      "The launcher icon still toggles the panel open/closed at any time either way"
    ]
  }
];
