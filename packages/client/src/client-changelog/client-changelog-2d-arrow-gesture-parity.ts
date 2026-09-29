import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_2D_ARROW_GESTURE_PARITY: ClientChangelogEntry[] = [
  {
    createdAt: 1790702571171,
    introducedIn: "2026.09.29.4",
    title: "The arrow-drag attack gesture, win-chance labels and shield highlighting now work on the 2D map too",
    why: "The arrow-drag attack gesture, its win-chance labels and the shield-coverage highlight only rendered on the true-3D map -- players on the 2D canvas renderer (the accessibility fallback for devices that can't run 3D) had no visual for any of it, even though the underlying gesture input already worked for them.",
    changes: [
      "2D canvas renderer: right-click-drag (desktop) or long-press-and-drag (mobile) from an owned muster flag now draws the same straight arrow to your drag target, and releases into the same confirm sheet and SET_MUSTER send as the 3D renderer",
      "2D canvas renderer: enemy tiles the arrow crosses now show the same win-chance percentage label as the 3D renderer, and tiles a known muster flag would shield now show a tinted highlight",
      "Renderer parity for this feature is now complete: both the 2D and 3D map show the same arrow, win-chance labels and shield highlight"
    ]
  }
];
