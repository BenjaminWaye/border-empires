// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_83: ClientChangelogEntry[] = [
  {
    createdAt: 1789375785265, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.03",
    title: "Steampunk visual pass extends to the Fleet, Senate, and Tech Tree panels",
    why: "The last pass reskinned the shared HUD chrome (login, side panels, buttons, gauges) but left the individual gameplay feature panels on their old palettes -- this pass covers the panels players see most often.",
    changes: [
      "Fleet and Senate panels (in Space View) now use the brass/parchment/verdigris palette and Cinzel/Space Mono fonts instead of their old blue-green sci-fi tint -- incoming-raid alerts stay a deliberate red warning color",
      "Tech tree detail cards/modals now use the riveted brass panel frame and parchment/ember text colors instead of the old cold-blue modal",
      "Victory hold alert, ally-request badge, and the town overview stat grid (Population/Gold/Manpower/etc. cards) now use the brass/verdigris/ember palette",
      "Smaller chrome -- bug report modal, player profile card, rush-buy/capture-goto buttons, Discord join button, placement overlay, dev-queue and tile-progress-queued chips -- also picked up the brass palette",
      "Muster flags and the season lobby war-room screen were already on-theme from earlier passes and were left as-is",
      "Still on the old palette for a future pass: the remaining settings sub-panels not listed above, and any minor tooltip/chip not covered here"
    ]
  },
  {
    createdAt: 1789549757908, // frozen, 1ms after the "hills read as gentle" entry -- keeps ordering stable
    introducedIn: "2026.09.16.2",
    title: "Steampunk visual pass fixes the shared card box, the tile-click popup, nation color picker, and alliance/changelog chrome",
    why: "Prior passes reskinned shared HUD chrome and most feature panels, but a single unthemed shared \".card\" base class left a long tail of unrelated panels (activity feed, season victory, development, manpower, empire integrity, tech tree bonuses, alliance empty-states) on the old flat dark-navy box, and a few high-visibility pieces -- the tile-click action popup, the nation color picker, and the changelog's release-info strip -- had never been touched by any pass at all.",
    changes: [
      "The shared \".card\" box used across activity feed items, Season Victory/Winner cards, the Development panel's Active Slots/Waiting sections, Manpower's Cap/Regen Modifiers, and Tech Tree's Active Bonuses cards now uses the brass/parchment palette instead of a flat dark-navy box",
      "The tile-click action popup (title, tabs, action cards like \"Expand To\", and the close/footer chrome) is now a brass-bordered panel with verdigris action cards instead of the old unthemed dark-navy/blue popup",
      "The Nation Color picker's preset-swatch row and Custom color-input frame (onboarding and the profile-edit overlay) now sit on a themed brass panel instead of a plain white/light-gray box",
      "Alliance panel empty-states (\"No allies.\", \"No active truces.\", pending request/truce cards) now match the brass palette; the ally player-name suggestion list is a native browser <datalist> whose popup styling can't be reached from CSS, so only the input itself (already themed) is stylable",
      "The changelog overlay's sticky \"Release X • Build Y / N new entries\" strip now uses the brass palette instead of its old dark-navy gradient"
    ]
  }
];
