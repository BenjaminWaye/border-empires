// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_69: ClientChangelogEntry[] = [
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
  },
  {
    createdAt: 1788972991596, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.7",
    title: "New worlds place real jungle, marsh, snow, and plains -- plus oases in the desert, and towns that follow rivers",
    why: "Given how much bigger this world is than a typical strategy-game map, the previous 4-biome palette (grass/sand/tundra/coastal) read as repetitive at that scale. This adds four more genuinely distinct visual biomes, oasis landmarks in the desert, and biases new-season town placement toward river paths, so following a river is a real way to find towns instead of towns being placed with no relationship to the map's rivers at all.",
    changes: [
      "New seasons place real jungle (tropical forest), marsh (wet ground near coasts/lakes), snow (the coldest tundra), and plains (a lighter, drier grassland) as genuinely distinct biomes",
      "New seasons scatter oasis landmarks -- a small lake with a fertile ring -- inside large desert regions",
      "New seasons place roughly a third of their towns along river paths, so exploring along a river is a real way to find settlements",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  }
];
