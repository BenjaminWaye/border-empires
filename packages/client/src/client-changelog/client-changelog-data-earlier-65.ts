// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_65: ClientChangelogEntry[] = [
  {
    createdAt: 1789248022065, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.01",
    title: "Fixed buildings rendering much darker than trees in the true-3D map (e.g. Mint Works)",
    why: "Building materials (iron, brass, rivets, etc.) use non-trivial metalness, which in three.js's PBR lighting model scales a surface's diffuse response toward zero -- metallic surfaces are lit almost entirely by reflecting an environment map, not by the scene's hemisphere/sun/fill lights. With no environment map set, metallic buildings had nothing to reflect and rendered near-black, while trees (which use no metalness) were lit normally by the same lights.",
    changes: [
      "The true-3D renderer now bakes a neutral environment reflection and gives it directly to structure materials (Mint Works and other buildings), so they read as properly lit instead of near-black",
      "The reflection is scoped to structures only, not the whole scene -- trees, terrain, and everything else keep their original brightness",
      "Sun/hemisphere/fill lighting and shadows are unchanged"
    ]
  }
];
