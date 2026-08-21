// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use Date.now() when authoring a new entry.
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const RECENT_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1787294902457, // 2026.08.20.1
    introducedIn: "2026.08.20.1",
    title: "ADVANCE-mode muster attacks now show the skirmish animation too",
    why: "A manual attack is almost always against a tile you're currently looking at, so it's already loaded client-side. But a muster flag in ADVANCE mode fires autonomously against whatever the server's own search finds nearest — which can be a tile this client has never had vision of. The skirmish overlay required already knowing that tile's owner, so it silently skipped rendering for the whole ~30s countdown, only appearing once the resolution broadcast finally revealed the tile — reading as \"no animation until it resolves\", exactly for the fire-and-forget flags ADVANCE mode is meant for.",
    changes: [
      "An ADVANCE-fired attack now shows its own skirmish animation for the full countdown, the same as a manual attack, even when you haven't scouted the target tile yourself.",
      "The dot colors briefly use a placeholder until real tile data arrives (typically within the countdown), then switch to the correct owner colors."
    ]
  },
  {
    createdAt: 1787041917435, // 2026.08.17.3
    introducedIn: "2026.08.17.3",
    title: "Battle dots no longer pop when the clash hands off into rout",
    why: "The clash phase sways each dot back and forth (spread + a forward jostle so the two lines press together instead of overlapping), but the instant rout began that whole oscillation was dropped in favor of a clean push-through/scatter position — a small but real positional snap right at the clash/rout boundary, on top of the exact same seam that was already fixed between the pre-resolution skirmish and the clash phase.",
    changes: [
      "Dots now settle out of the clash's sway over the first ~140ms of rout instead of dropping it instantly, so the clash and rout phases read as one continuous motion rather than two animations stitched together."
    ]
  },
  {
    createdAt: 1786960037000, // 2026.08.17.1
    introducedIn: "2026.08.17.1",
    title: "World Engine strikes now shake the map and broadcast to everyone",
    why: "Firing the World Engine used to be a private moment — only the caster's own client got any indication a city had been leveled, via a local pulse effect that never reached anyone else, including the city's owner. A strike that levels a city and costs real population is exactly the kind of moment every empire should hear about, not just the two sides involved.",
    changes: [
      "Landing a World Engine strike on an enemy city now shakes the map once, live, for every connected player — not just the caster.",
      "A new destruction-themed popup announces who fired it, what city was hit, how many lives were lost, and who owned the town.",
      "That announcement stays visible in the Activity Feed's new \"World Events\" section for 12 hours, so logging in after the fact still tells you what happened."
    ]
  },
  {
    createdAt: 1787003302865, // 2026.08.17.2
    introducedIn: "2026.08.17.2",
    title: "Battle animation reworked: troops line up, march, clash with casualties, then rout",
    why: "The battle overlay's approach phase was a single 550ms beat — dots barely had time to read as \"forming up\" before they were already marching. And the clash itself, while it now threw glyph bursts into the air, never lost a single dot: the swarm stayed exactly DOTS_PER_SIDE strong right up until rout, so a fight that had clearly been decided (attackerWon is known from the very first frame) never showed any sign of a cost.",
    changes: [
      "Both sides now form up at their own tile-local edge for ~2.5s before marching — previously they started marching almost immediately.",
      "The march itself now takes ~0.9s (previously ~550ms combined with forming up), so the two sides visibly close the distance instead of snapping into position.",
      "Once the outcome is known, some dots now fall during the clash — a fixed 2 of 10 for the winning side, 4 of 10 for the losing side, so the losing side visibly thins before rout confirms it, and both sides always keep enough survivors for rout to have something to actually push through or scatter.",
      "The clash window is now ~1.3s (previously 800ms), giving the glyph bursts and new casualties room to read clearly instead of feeling rushed."
    ]
  },
  {
    createdAt: 1786910628146, // 2026.08.16.1
    introducedIn: "2026.08.16.1",
    title: "Swapped the waypoint and mustering flag overlays",
    why: "The elaborate steampunk tower — banner, medallion, cannons, dome, spire — used to mark a single movement waypoint, while mustering tiles got a small pennant. That was backwards: a big banner-bearing tower reads as a rallying point, not a mere movement destination, and mustering tiles can appear several at once across a border while a waypoint queue is just one player's own path.",
    changes: [
      "Mustering tiles now show the full tower/banner assembly, with the marching soldier dots still converging on it as manpower fills.",
      "Waypoint queue entries now show a small pennant instead — no soldier dots, since a waypoint isn't accumulating troops.",
      "The tower now renders efficiently across many simultaneous mustering tiles instead of being limited to a handful of instances."
    ]
  },
  {
    createdAt: 1786924800000, // 2026.08.16.2
    introducedIn: "2026.08.16.2",
    title: "Fogged sea tiles no longer render as a solid black hole",
    why: "Sea tiles were never part of the 3D heightfield mesh (the water plane sits over a deliberate hole in it), so the fog-of-war darken overlay — which works by tinting a land tile's already-drawn remembered terrain — had nothing underneath it for sea. The result was a fully opaque black quad over an empty hole, on top of the scene's own black fog background: indistinguishable from unexplored fog, right at any coastline your vision doesn't currently reach.",
    changes: [
      "Fogged SEA/COASTAL_SEA tiles now draw the same live water surface visible sea gets instead of a black darken overlay, so remembered coastline reads as water again."
    ]
  },
  {
    createdAt: 1786965132570, // 2026.08.16.3
    introducedIn: "2026.08.16.3",
    title: "Battle dots: attacker and defender no longer disappear into each other during the clash",
    why: "The clash-phase oscillation only ever varied a dot's position along the perpendicular spread across the tile, never along the attacker-defender line itself. That meant an attacker dot and a defender dot with the same per-dot spread value landed on the exact same point, every frame, for the whole clash — the two swarms were genuinely coincident, not just visually crowded. With depth testing disabled on both dot materials (needed so they always render on top of the terrain), whichever side's mesh happened to draw second fully hid the other, so the entire clash read as a single-color blob with no visible fight between two sides — confirmed with the new Storybook \"Full Attack Lifecycle\" story, where the attacker's dots were invisible for the whole clash and only reappeared once rout physically separated the two sides.",
    changes: [
      "Each side now holds a small, jostling offset along the attack line during the clash, so attacker and defender read as two distinct lines pressed together instead of one side fully hiding the other."
    ]
  },
  {
    createdAt: 1786811200000, // 2026.08.15.5
    introducedIn: "2026.08.15.5",
    title: "Battle dots now actually approach and meet in the middle before fighting",
    why: "The pre-resolution skirmish loop — what an attacker or defender watches for nearly all of a ~30s siege, per 2026.08.14.1 — rendered dots already oscillating in melee at the tile center from its very first frame, with no approach. Only a bystander with no stake in the fight (who only ever sees the post-resolution combat broadcast) got the intended approach-then-clash sequence, because that path already had one. So the two players actually fighting never saw the dots close the distance; the fight just appeared already underway, which read as broken rather than as a fight starting. Separately, the handoff from skirmish to resolved battle only ever checked the defender's own siege-tracking map, so an attacker's resolved battle always restarted its approach from scratch even after their dots had already been fighting for the whole countdown — snapping them back out to the tile edge right as the fight was supposed to conclude.",
    changes: [
      "The pre-resolution skirmish now plays the same converge-on-the-target-tile approach as a resolved battle before settling into its ongoing melee, instead of starting the melee immediately.",
      "The approach plays once per skirmish as seen by this client, so reloading mid-siege still shows a fresh approach instead of a jump-cut into an already-oscillating fight.",
      "An attacker's own resolved battle now continues seamlessly from their already-visible skirmish instead of restarting its approach animation, matching what defenders already saw."
    ]
  },
  {
    createdAt: 1786810965877, // 2026.08.15.4
    introducedIn: "2026.08.15.4",
    title: "The Mustering overlay now updates every second instead of every ~30 seconds",
    why: "A muster flag's manpower only ticks on the server's regular ~30-second global schedule, which is why the overlay always felt jaggy — long flat stretches then a jump. The server already has a mechanism for fast per-second ticks on a specific flag a player is actively watching, but it was only ever triggered by tapping that exact tile's action menu — never by simply having an attack parked and waiting on it, which is when the overlay is actually on screen.",
    changes: [
      "Parking a manual attack behind a muster flag now tells the server to watch that flag, so its manpower ticks every 1 second instead of every ~30 while the attack is waiting on it — the overlay should track real progress far more smoothly.",
      "The fast tick automatically stops once the attack fires, is dropped, or is cancelled."
    ]
  },
  {
    createdAt: 1786796146676, // 2026.08.15.3
    introducedIn: "2026.08.15.3",
    title: "Mustering overlay no longer shows \"ready\" before it actually is; ambient audio now defaults off",
    why: "The Mustering overlay's staged/required readout is smoothed between the sparse (~30s-cadence) server updates by extrapolating from the last observed accumulation rate. That extrapolation was capped at `required`, so once the prediction crossed the threshold — commonly well before the next real server tick, since the rate estimate from a short first sample tends to overshoot — the bar showed a false \"ready\" state for a long stretch before the attack that number is supposed to represent actually fired. Separately, ambient background audio defaulted to on for anyone who'd never touched the setting.",
    changes: [
      "The Mustering overlay's staged/required number can no longer visually reach or exceed what's required before a real server update confirms it — it always stays a hair behind reality instead of occasionally lying ahead of it.",
      "Ambient background audio now defaults to muted; turn it on from Settings if you want it."
    ]
  },
  {
    createdAt: 1786792818601, // 2026.08.15.2
    introducedIn: "2026.08.15.2",
    title: "A muster flag reaching full manpower now actually launches the attack",
    why: "Once a muster flag finished staging, the attack was promoted from the waiting list into the real dispatch queue — but nothing then told the queue to actually process it. The 300ms heartbeat that runs the promotion check returns immediately afterward on a guard meant for an unrelated case (handling a stuck server acknowledgement while an attack is already in flight), so a freshly promoted attack just sat in the queue doing nothing unless some unrelated event happened to nudge it — a different click, an incoming tile update, anything. Visibly, the flag would fill up and the attack would simply never fire.",
    changes: [
      "A muster flag that finishes staging now dispatches its attack immediately instead of potentially sitting queued indefinitely."
    ]
  },
  {
    createdAt: 1786792013605, // 2026.08.15.1
    introducedIn: "2026.08.15.1",
    title: "A stuck manual attack now cancels itself after 5 minutes instead of parking forever",
    why: "A parked attack waiting on a muster flag only had an expiry if the client had just requested a brand-new flag for it. An attack parked against a flag that already existed at queue time had no expiry at all — if that flag never accumulated enough manpower (or the amount/requirement otherwise never converged), the \"Mustering...\" overlay could sit frozen indefinitely with no way out short of a reload. Separately, that overlay's staged/required text was unreadable — the number defaults to near-black text sized for the lighter default capture-bar background, but Mustering uses a dark blue background.",
    changes: [
      "A parked attack now cancels itself with a feed message if it hasn't staged enough manpower within 5 minutes, regardless of why it stalled — instead of sitting frozen forever.",
      "Fixed: the staged/required number on the Mustering overlay was rendered in near-black text on a dark blue background, making it unreadable."
    ]
  },
  {
    createdAt: 1786905792661, // 2026.08.16
    introducedIn: "2026.08.16",
    title: "The Caravanary is now the Trade Nexus, with a new commercial-hub look",
    why: "The Caravanary still read as a humble road-station courtyard, while the trade network needed to sell concentrated wealth — a grand exchange hall where trade routes converge, with cargo and brass machinery at work. Renamed the building to Trade Nexus and gave it a look to match; the underlying road-network mechanics are unchanged.",
    changes: [
      "The Caravanary structure is renamed Trade Nexus everywhere in the UI (build menu, tile info, tech tree). Its behavior — enabling the connected-town road network and income bonus — is unchanged.",
      "New 3D overlay: a grand domed trading hall on an octagonal stone plinth, ringed by six converging trade roads, merchants' warehouses, stacked cargo, brass jib cranes, feed pipes, warm hanging lamps and a slowly winding brass clockwork seal atop the dome — replacing the old fortified-inn look.",
      "A matching flat-color 2D icon (trading hall, converging routes, cargo and brass machinery) accompanies the 3D asset."
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER
];
