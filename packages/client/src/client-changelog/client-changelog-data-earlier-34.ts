// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_34: ClientChangelogEntry[] = [
  {
    createdAt: 1788499023922, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.1",
    title: "ADVANCE and MARCH mustering flags now have real travel time too",
    why: "Manually-clicked attacks got real travel time and a marching-company visualization, but a flag's own ADVANCE/MARCH auto-fire attacks still resolved the instant the server dispatched them -- geography had no bearing on when an auto-fired attack landed, and there was nothing to see beforehand. Auto-fire is dispatched by the server with no client-side send delay to wait on, so this had to be a genuine mechanical delay in the server's own combat timing, not just a client-side wait.",
    changes: [
      "An ADVANCE/MARCH flag's auto-fired attack now waits for its funding flag's company to reach the front before combat resolves, at the same per-tile rate manual attacks already use",
      "The true-3D map now shows that march too: the same marching-company overlay manual attacks get, now also playing for ADVANCE auto-fire",
      "MARCH-mode auto-fire gets the same mechanical delay, but not yet the marching visualization -- MARCH attacks have no skirmish overlay at all client-side yet, a separate pre-existing gap"
    ]
  },
  {
    createdAt: 1788470470712, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.6",
    title: "Mustering flags now have real travel time -- and you can watch the company march there",
    why: "A muster-funded attack used to fire the instant you clicked it, no matter how far the funding flag actually was from the fight -- geography had no bearing on when an attack landed, and there was nothing to see between clicking and the 30-second siege starting. Manual attacks now genuinely wait for the flag's company to reach the front before the attack is even sent, and the true-3D map shows that march happening -- a company of dots walking the real tile-by-tile route from the flag to the target tile, dashing across any dock crossing along the way.",
    changes: [
      "A muster-funded manual attack now marches for real: the ATTACK isn't sent to the server (and its 30s combat lock doesn't start) until the funding flag's company actually reaches the front, instead of firing the instant you click",
      "The true-3D map now shows that march: a company of dots walks the real tile-by-tile route from your flag to the target, bending around corners and dashing across dock crossings, instead of no visualization at all",
      "ADVANCE/MARCH auto-fire attacks are unaffected -- this only changes manually-clicked attacks funded by a ready muster flag",
      "3D-renderer only for now -- the 2D canvas map fallback has no muster visualization of any kind yet, matching its existing gap for muster flags in general"
    ]
  }
];
