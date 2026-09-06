// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_23: ClientChangelogEntry[] = [
  {
    createdAt: 1788552483010, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.12",
    title: "Muster flags now say what they're actually doing: traveling, fighting, or planning their next move",
    why: "An Advance or March flag's tile menu, HUD panel row, and on-map alert only ever said \"Advancing\"/\"Holding\" -- with no way to tell whether it was mid-fight, waiting out its auto-fire cooldown, or just idle. A March flag was worse off: it fell all the way through to the generic \"Holding\" text since only Advance was special-cased, hiding its real target and progress. The server now tracks each flag's live auto-fire status (in combat vs. cooling down, and which enemy tile it's fighting for) and syncs it down so all three surfaces show the same real story.",
    changes: [
      "Muster flags now show \"Fighting at (x, y)\" while an attack they funded is in progress, instead of just \"Advancing\"",
      "An idle Advance/March flag now shows a live \"Planning next move — Ns\" countdown to its next auto-fire search instead of no timing info at all",
      "That countdown now says why it's waiting when it can: \"No target within range\" when nothing attackable exists nearby, or \"Not enough manpower for the nearest target\" when a real target is in range but this flag can't afford to hit it yet",
      "March flags now get their own accurate status text (fighting/cooldown/target) instead of silently falling back to the generic \"Holding\" wording meant for Hold-mode flags"
    ]
  },
  {
    createdAt: 1788563858436, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "The manpower panel's muster flag status now updates live while you're watching it",
    why: "A muster flag's status line (fighting, planning next move with a countdown, waiting on a target) only changed when a server tile delta happened to arrive, so a player who opened the manpower panel to watch a flag work would see the countdown text freeze in place between updates instead of ticking down, even though the flag was actively counting down toward its next action.",
    changes: [
      "The manpower panel's \"Active muster flags\" list now refreshes once a second whenever it's open and you have an Advance or March flag out, so its status text (fighting, countdown, waiting on a target) visibly keeps pace instead of only updating on the next server push"
    ]
  },
  {
    createdAt: 1788331350303, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.9",
    title: "Fogged and unexplored tiles now offer Expand To, and show a Fogged/Unexplored status",
    why: "A fogged (previously-explored, currently out-of-vision) tile's menu unconditionally showed zero actions, even on ordinary claimable neutral land -- there was no way to expand toward ground you'd already seen once but had since lost vision of. An unexplored tile's menu offered a waypoint in some cases but no plain adjacent claim, and neither menu said anything about why the tile looked the way it did.",
    changes: [
      "Fogged and unexplored land tiles now offer \"Expand To\" (adjacent claim or a routed waypoint chain, same as any other neutral target) instead of no actions at all",
      "Both menus now show a status line (\"Fogged — showing last known data\" / \"Unexplored — terrain unknown\") explaining why the tile's info might be incomplete or out of date"
    ]
  },
  {
    createdAt: 1788379533532, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.16",
    title: "March-To now marks its destination tile, can be cancelled there, and holds war music longer",
    why: "A \"March To…\" order gave no visual sign of where the flag was actually headed, and cancelling it required going back to the origin flag's own menu -- unlike a waypoint, whose destination tile marks itself and offers a one-click cancel. Separately, the war-music soundtrack re-evaluated combat/tension every frame straight off live signals (an ADVANCE/MARCH flag, an active battle), so a manual attack that resolved in a couple of seconds -- with no muster flag involved -- flipped the track straight back out of war music, and a March-To order itself didn't count as combat at all until an actual skirmish landed.",
    changes: [
      "March-To now plants a war-red flag marker (reusing the waypoint flag model) on the tile you're marching toward -- true-3D renderer only for now; the 2D-fallback renderer doesn't draw a waypoint flag marker either, so this doesn't introduce a new gap between them",
      "Clicking that destination tile now offers Cancel March, the same way a waypoint's destination offers Cancel Waypoint",
      "Setting a March-To order now counts as combat immediately, so the soundtrack switches to war music right away instead of waiting for the first attack to land",
      "War/combat music now holds for 2 minutes after the last live combat signal instead of dropping straight back to tension/calm the instant a manual attack resolves",
      "Fixed the destination tile's Cancel March action sometimes cancelling the wrong flag, and the marker/menu pool being sized too small, when several of a player's own flags share a destination or one tile is both an origin and a destination"
    ]
  }
];
