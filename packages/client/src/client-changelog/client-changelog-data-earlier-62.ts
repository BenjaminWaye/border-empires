import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_62: ClientChangelogEntry[] = [
  {
    createdAt: 1788979082413, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.1",
    title: "3D ground terrain looks more detailed and less flat",
    why: "The painted ground texture's bump/sheen detail and the flat land's height variation both read as a little too clean and uniform up close. This pushes further within the game's existing hand-painted 3D style -- not a shift to photorealism -- for terrain with more visible texture and a gentler, more natural roll to the land.",
    changes: [
      "Ground texture now has sharper relief and more contrast between duller and shinier patches",
      "Flat land gently rolls instead of reading as a dead-flat plane",
      "Hills now cast and catch shadows like the rest of the terrain, so their shaded side no longer looks flat-lit"
    ]
  }
];
