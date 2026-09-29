import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_ATTACK: ClientChangelogEntry[] = [
  {
    createdAt: 1790450114922, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.29.2",
    title: "The arrow-drag gesture now actually launches an attack",
    why: "Right-click-dragging an arrow from a muster flag to a target tile drew the arrow and painted win chance, but released into nothing -- no confirm, no way to choose how much manpower to commit, and no SET_MUSTER sent, so the gesture never actually gave the flag a March-To target.",
    changes: [
      "True-3D renderer: releasing an arrow drag now opens a confirm sheet with a manpower slider and Normal/Extra/Double presets; pressing Go sends the same SET_MUSTER March-To command the tile menu's commit tab sends, Escape or clicking outside the sheet cancels",
      "2D canvas renderer (accessibility fallback): has no arrow-gesture yet -- separate follow-up"
    ]
  }
];
