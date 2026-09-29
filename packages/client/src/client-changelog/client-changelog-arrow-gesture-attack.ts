import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_ATTACK: ClientChangelogEntry[] = [
  {
    createdAt: 1790702571169,
    introducedIn: "2026.09.29.2",
    title: "The arrow-drag gesture now actually launches an attack",
    why: "Right-click-dragging an arrow from a muster flag to a target tile drew the arrow and painted win chance, but released into nothing -- no confirm, no way to choose how much manpower to commit, and no SET_MUSTER sent, so the gesture never actually gave the flag a March-To target.",
    changes: [
      "Releasing an arrow drag now opens a confirm sheet with a manpower slider and Normal/Extra/Double presets; pressing Go sends the same SET_MUSTER March-To command the tile menu's commit tab sends, Escape or clicking outside the sheet cancels"
    ]
  },
  {
    createdAt: 1790702571170,
    introducedIn: "2026.09.29.3",
    title: "The arrow-drag attack gesture now works on mobile too",
    why: "The arrow-drag attack gesture (arm a muster flag, drag an arrow to a target, confirm) only worked with a desktop right-click-drag -- mobile/touch players had no way to trigger it.",
    changes: [
      "Long-pressing an owned muster flag (~450ms held still) now arms the same arrow-drag gesture desktop right-click-drag uses; dragging your finger draws the arrow and shows win chance, lifting your finger opens the same confirm sheet and sends the same SET_MUSTER command",
      "Moving your finger past a small threshold before the long-press fires is treated as an ordinary pan/scroll instead, so this doesn't interfere with panning the map or tapping to select/open the tile menu"
    ]
  }
];
