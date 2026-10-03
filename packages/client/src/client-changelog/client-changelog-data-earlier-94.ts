import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Historical record only -- deliberately left unreferenced by
// client-changelog-data.ts / client-changelog-recent-groups.ts. These
// entries described the hold-drag / long-press-drag attack-arrow gesture,
// which was replaced by click-to-target (see client-changelog-arrow-click-
// targeting.ts) -- leaving them live would misdescribe current behavior to
// players, so they're archived here per the maintenance note atop
// client-changelog-data.ts rather than deleted outright.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_94: ClientChangelogEntry[] = [
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
  },
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
  },
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
  },
  {
    createdAt: 1790716100000,
    introducedIn: "2026.09.29.5",
    title: "Arrow-drag works with a Mac trackpad, and shield coverage no longer looks like dark squares",
    why: "The arrow-drag attack needed a held right mouse button, which a Mac trackpad can't do (ctrl+click arrives as a left press), so it was unreachable there. And a muster flag's shield coverage was drawn as a grid of dark, gapped squares in the owner's raw color.",
    changes: [
      "Hold Ctrl and drag from one of your muster flags to draw the attack arrow (same as right-click-drag); a plain left-drag still pans the map",
      "3D map: the shield-coverage tint around a muster flag now only shows while you are dragging the attack arrow, only on enemy-owned tiles, and is a soft gapless wash instead of dark squares"
    ]
  }
];
