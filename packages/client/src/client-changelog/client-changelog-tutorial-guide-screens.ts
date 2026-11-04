import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TUTORIAL_GUIDE_SCREENS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793807483840, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "The guide stays with you in Manpower and Manifests",
    why: "The guide sent you to the Manpower and Manifest screens and then disappeared behind them, discovery tips popped up beside it, and it never showed which Manifest it meant.",
    changes: [
      "The guide card now stays visible over the Manpower panel, the Manifest screen and the other full-screen views it points you to",
      "The Manifest tree marks the guide's pick, the Industrial Tooling Module, with a glowing ring and a \"Guide pick\" badge",
      "A new \"Your reach\" step, right after your first town and food, teaches you to build a Relay Beacon to push your reach and vision outward, with the best tile marked (a beacon costs manpower and uses a food slot). If you were already past that point in the guide, it doesn't send you back",
      "While the guide card is open, discovery tips wait: the first-town and food tips it already teaches are skipped, the rest show once you minimise, finish or hide the guide, and warnings like Beyond Your Reach and First Contact still show right away"
    ]
  }
];
