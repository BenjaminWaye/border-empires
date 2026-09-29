import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_ARROW_GESTURE_LINGERING_FIX: ClientChangelogEntry[] = [
  {
    createdAt: 1790702571172,
    introducedIn: "2026.09.29.4",
    title: "The arrow-drag attack gesture no longer lingers after an interruption",
    why: "Backgrounding the tab, losing your WS connection, or having your dragged-from flag captured mid-drag used to leave the arrow-drag gesture stuck: the arrow kept pointing from a tile you no longer controlled, and the confirm sheet stayed open offering to send a command for a flag that was gone.",
    changes: [
      "Both renderers: switching away from the tab or window now cancels an in-progress arrow drag immediately instead of leaving the arrow hanging",
      "Both renderers: if the flag you're dragging from is captured, destroyed, or loses its muster mid-drag, the drag now cancels instead of still offering to commit manpower for it",
      "Both renderers: the manpower confirm sheet now auto-dismisses if a fresh tile update shows the origin flag is no longer yours while the sheet is open"
    ]
  }
];
