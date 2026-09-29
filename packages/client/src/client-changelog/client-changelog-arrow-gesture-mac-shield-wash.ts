import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_MAC_SHIELD_WASH: ClientChangelogEntry[] = [
  {
    createdAt: 1790716100000,
    introducedIn: "2026.09.29.5",
    title: "Arrow-drag works with a Mac trackpad, and shield coverage no longer looks like dark squares",
    why: "The arrow-drag attack needed a held right mouse button, which a Mac trackpad can't do (ctrl+click arrives as a left press), so it was unreachable there. And a muster flag's shield coverage was drawn as a grid of dark, gapped squares in the owner's raw color.",
    changes: [
      "Hold Ctrl and drag from one of your muster flags to draw the attack arrow (same as right-click-drag); a plain left-drag still pans the map",
      "3D map: a muster flag's shield coverage is now one soft, lightened wash with no gaps instead of dark squares around the flag"
    ]
  }
];
