// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_68: ClientChangelogEntry[] = [
  {
    createdAt: 1789417055099, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.07",
    title: "Fixed a stability issue from the earlier barbarian-attack AI fix",
    why: "An earlier fix let AI empires retarget instantly (no cooldown at all) after an attack was rejected because the target changed hands. On a fast-moving barbarian frontier that meant some AI empires could resubmit rejected attacks every single game tick with nothing slowing them down, which piled up enough simultaneous work on the game server to stall it -- for a period, no one could log in.",
    changes: [
      "AI empires retargeting after a barbarian border flip now wait a brief moment (about a second) before attacking again, instead of instantly resubmitting -- still fast enough that it doesn't get stuck, but no longer able to overwhelm the server"
    ]
  },
  {
    createdAt: 1789417055098, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.06",
    title: "Toned down territory color in the 3D map",
    why: "Settled-territory tint sat at 0.85 opacity -- strong enough that a large empire's interior read as a solid color wash over the terrain, and left little visual gap between settled and frontier tint once frontier had earlier been raised to stay visible.",
    changes: [
      "Settled territory tint is now 0.6 opacity (down from 0.85) -- terrain and structures underneath stay visible through your own color",
      "Frontier tint is now 0.3 opacity (down from 0.5) -- keeps a clear, three-way gap between unowned, frontier, and settled tiles instead of frontier and settled nearly meeting in the middle",
      "3D map only -- the 2D canvas renderer's border strokes are a separate, already-more-restrained treatment and are unaffected"
    ]
  }
];
