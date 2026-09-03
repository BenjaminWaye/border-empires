// Older client-changelog entries, split out of client-changelog-data-earlier.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data-earlier.ts under its line cap when the trailing week
// has a lot of entries, not as a permanent archive. Prune entries here once
// they fall outside the trailing week, same as in the other two files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_2: ClientChangelogEntry[] = [
  {
    createdAt: 1788166365565, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed the season-winner galactic bonus vanishing after a reconnect",
    why: "Last season's Planet winner gets a one-time manpower-regen and vision-radius head start for their next season. That bonus was correctly granted and tracked on the server, but the reconnect/login payload that rebuilds your empire's state on the client never referenced either field at all -- so the bonus silently disappeared from what you saw the moment you reconnected, even though the server kept applying it underneath.",
    changes: [
      "The galactic-wonder manpower-regen and vision-radius bonuses now reliably carry through a reconnect, matching what the server has actually been applying."
    ]
  },
  {
    createdAt: 1788088263076, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.5",
    title: "Relit the 3D map and fixed resource/town icons jittering while panning",
    why: "The sun light sat well off to one side of the map's fixed camera angle, so the faces of buildings and terrain the camera actually looks at stayed shadowed no matter where you looked. Separately, the small badge/marker icon layer over the 3D view (resource, dock, and town icons) redrew on a slower, throttled cadence left over from the old full 2D map renderer -- fine when panning snapped a whole tile at a time, but visible as lag/jitter now that panning moves the camera continuously every frame.",
    changes: [
      "The 3D map's key light now shines from roughly the same direction the fixed camera looks, instead of off to one side, so building and terrain faces read lit instead of shadowed",
      "Resource, dock, and town icons over the 3D map now redraw at close to full frame rate instead of a slower throttled cadence, so they no longer lag or jitter behind the terrain while panning"
    ]
  }
];
