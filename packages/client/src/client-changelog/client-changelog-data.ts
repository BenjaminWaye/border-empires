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
    createdAt: 1786710132407, // 2026.08.14.1
    introducedIn: "2026.08.14.1",
    title: "Battle dots now animate for the whole attack, not just its last two seconds",
    why: "The pre-resolution skirmish animation added in 2026.08.11 was effectively never visible to anyone. Two independent bugs killed it. First, the client tracked an in-progress siege in a map that was wiped by *any* tile delta touching that tile — and a tile under attack keeps receiving routine yield, population, and muster tick deltas throughout its ~30s countdown, so the siege was usually evicted seconds after it registered, taking the dots and the red under-attack cross with it. Second, the attacker never had a siege entry to begin with: the server addresses its attack alert to the defender only, which is correct for an \"under attack\" warning but left the attacking player's own fight with nothing to render until the outcome broadcast arrived. What survived both was the ~2.3s resolution flourish, which is driven separately — so an attack looked like it only animated at the very end.",
    changes: [
      "Battle dots now animate for the full duration of an attack instead of only the final ~2.3s resolution flourish.",
      "Attackers now see the fight on the tile they are attacking, not just defenders.",
      "An in-progress siege now ends only when the combat actually resolves or the tile changes hands — no longer cancelled by unrelated yield/population/muster updates on the same tile. The red under-attack cross also stays visible for the whole countdown.",
      "The under-attack cross now pulses faster as the attack becomes imminent, which it previously never did."
    ]
  },
  {
    createdAt: 1786647377657, // 2026.08.13.4
    introducedIn: "2026.08.13.4",
    title: "Fixed a manual attack permanently stuck showing only a queue-position badge",
    why: "A dead local variable (`allowOptimisticOrigin`, computed but never passed) meant every queued attack — not just EXPANDs — always looked up its origin with confirmed-ownership-only rules, even though attacks were always meant to allow an optimistic (not-yet-acked) origin. When the only adjacent origin tile was itself still an unconfirmed optimistic claim, the queue entry could never resolve an origin: it just re-armed a 900ms wait and requeued itself forever, with no cap. Because the promotion out of \"Mustering...\" happens before that wait loop is reached, the capture overlay had already disappeared, leaving only the small numeric queue-position badge (e.g. \"1\") with nothing visibly ahead of it — looking permanently stuck. Separately, the \"Mustering...\" progress bar itself only updates when a server tile delta lands, and muster accumulation only ticks server-side once per 30s, so the displayed percentage held flat for up to 30s and then jumped instead of visibly progressing.",
    changes: [
      "Attacks (as opposed to EXPANDs onto a neutral tile) now correctly allow dispatching from an optimistic origin immediately, instead of always requiring a confirmed one.",
      "As a backstop for any other case that could still stall this way: after ~13.5s of repeated waits for a confirmed origin, the queue falls back to the optimistic origin and dispatches rather than waiting indefinitely.",
      "The \"Mustering...\" progress bar now linearly extrapolates between server ticks using the last observed accumulation rate, instead of holding flat and jumping once a delta arrives."
    ]
  },
  {
    createdAt: 1786633566657, // 2026.08.13.3
    introducedIn: "2026.08.13.3",
    title: "Manual attacks now reuse a nearby muster flag instead of demanding a new one",
    why: "Launching a manual attack only ever considered a flag \"usable\" if it sat directly adjacent to the target — anything else, even a fully-funded flag two tiles away, was ignored, and the client auto-created a brand new flag right next to the target instead. With players already at the 3-muster-flag cap (e.g. mid an ADVANCE chain), that new flag request was silently rejected by the server (MUSTER_LIMIT), and the attack sat parked forever pointing at a flag that would never exist — the new \"Mustering...\" overlay (2026.08.13.2) stuck at 0 staged with no way to clear it short of reloading. The server, however, already auto-funds an attack from any owned flag within 10 tiles of wherever it's launched from (the same mechanism ADVANCE relies on) — the client just never used it for manual attacks.",
    changes: [
      "A manual attack now fires from the normal border tile and lets the server fund it remotely from any nearby flag with enough manpower, instead of requiring that exact flag to sit adjacent to the target — no more redundant flags for something an existing one already covers.",
      "Falling back to auto-creating a new flag only happens when nothing nearby has the manpower to fund the attack at all.",
      "As a safety net for the remaining case: a parked attack now gives up and cancels itself, with a feed message, if the flag it auto-requested still hasn't shown up a few seconds later — instead of sitting on a permanently stuck \"Mustering 0/N\" overlay."
    ]
  },
  {
    createdAt: 1786616905363, // 2026.08.13.2
    introducedIn: "2026.08.13.2",
    title: "Manual attacks now show a \"Mustering...\" overlay while manpower stages",
    why: "Launching a manual attack against a target whose adjacent muster flag wasn't fully staged used to give almost no feedback — the big capture overlay only appeared once the attack actually fired, so the wait beforehand looked like nothing was happening. Fixing this also surfaced (and fixed) a related bug: the flag was judged \"ready\" using a flat 60-manpower threshold instead of the target's real requirement, so an attack on a garrisoned fort could fire early and get rejected by the server even with manpower still visibly staged.",
    changes: [
      "Launching a manual attack now immediately shows the capture overlay in a \"Mustering...\" state, with a bar that fills toward the actual manpower this target requires (higher for a garrisoned enemy fort) and hands off to \"Capturing Territory...\" the moment it fires — no more silent wait in between.",
      "Cancel during mustering now just drops that queued target, leaving the flag and its staged manpower in place for another attack.",
      "Dismiss is also available during mustering, hiding the overlay while the flag keeps filling in the background — same as it already worked for the Capturing phase.",
      "Fixed: a muster flag could be judged ready off a flat 60-manpower threshold and fire early against a garrisoned fort, getting rejected by the server instead of waiting for the fort's real requirement."
    ]
  },
  {
    createdAt: 1786582800000, // 2026.08.13.2
    introducedIn: "2026.08.13.2",
    title: "Fixed: a town's Modifier totals never actually reached the tile popup",
    why: "The unified modifier catalog computed a town's combined stat totals (e.g. 3 Garrison Halls -> \"Manpower cap: +450\") correctly on the server, but the tile popup (REQUEST_TILE_DETAIL) is served by a separate gateway code path that reconstructs the town object from a persisted, redacted copy stripped down to 8 basic fields — townModifierTotals was never one of them, and this path never recomputed it the way it already does for support/gold/population numbers. The totals silently never reached any player's tile popup, including a town's own owner. Also found while fixing this: a stray non-numeric \"higher production raises gold cap\" line sitting inside the Modifiers list, and an old hand-written paragraph under Upkeep that restated the same Mintworks/Granary/Clearing House numbers the new Modifiers section already shows.",
    changes: [
      "A town's Modifier totals (manpower cap, gold, empire attack/defense, etc. from its support-ring buildings) now actually show on the tile popup.",
      "The aggregation math itself moved into the shared catalog so the simulation and the tile-popup path can't compute it two different (and driftable) ways again.",
      "Removed a non-numeric line that was sitting inside Mintworks's Modifiers list instead of being a real stat.",
      "Removed a duplicate paragraph under Upkeep that restated numbers the Modifiers section already shows for Mintworks, Granary, and Clearing House."
    ]
  },
  {
    createdAt: 1786579200000, // 2026.08.13.1
    introducedIn: "2026.08.13.1",
    title: "Fixed: most buildings still showed no Modifier section on their own tile",
    why: "The unified modifier catalog (2026.08.12.14) was reachable from the tech-tree/build-menu info panel for every building, but the tile-overview popup you get from clicking a built tile in-game still gated behind a small hardcoded allowlist of 8 building types left over from before the catalog existed — so most buildings (Garrison Hall, Census Hall, Foundry, Governor's Office, the Weapons Workshop family, synthesizers, Airport, Ambaric Tower, Resonance Grid, and more) showed an empty Modifier section when checked the normal way, in-game.",
    changes: [
      "Clicking any built structure's own tile now shows its full Modifier section, not just the small set of buildings that happened to be allowlisted before.",
      "Observatory tiles were never checked at all by the tile popup — its vision and crystal-range modifiers now show correctly.",
      "Relay Beacon was missing its vision bonus from the catalog (only offense showed) — both now show."
    ]
  },
  {
    createdAt: 1786575600000, // 2026.08.12.14
    introducedIn: "2026.08.12.14",
    title: "Unified building modifier display across tile popup and tech tree",
    why: "Building effect numbers (\"Manpower +150\", \"+50% farm food\", etc.) were hand-written in up to three separate places with no shared source of truth, so the tile-detail popup, the tech-tree structure panel, and the town summary could each show slightly different or missing numbers for the same building.",
    changes: [
      "Every building's tile-overview popup now shows a Modifiers section with the same white-label/green-value styling for every structure, not just the ~15 that used to be covered.",
      "The structure-info panel (opened from the build menu or tech tree) now shows the exact same modifier numbers in the same style, instead of separately hand-written prose.",
      "A town's support-ring buildings that stack across the whole town (e.g. multiple Garrison Halls) now show their combined total next to the town's Support/Population/Growth summary — widened to cover every stat a support building contributes, including Mintworks gold production and the Weapons Workshop family's empire attack/defense, combined across every building that feeds the same stat.",
      "Fort and Siege Outpost defense/offense lines now use the same \"stat: value\" format as every other modifier (e.g. \"Defense: 2.5x\") instead of folding the stat name into the colored value text."
    ]
  },
  {
    createdAt: 1786572000000, // 2026.08.12.13
    introducedIn: "2026.08.12.13",
    title: "Fixed: manual attack could stay queued forever behind a non-adjacent muster flag",
    why: "The NOT_ADJACENT fix (2026.08.12.12) made processActionQueue require a ready flag to actually be adjacent before firing, but the queue-promotion step that runs beforehand didn't check adjacency at all. Whenever the only fully-mustered flag near a target wasn't adjacent to it, the attack got promoted, rejected, and re-parked in an endless loop — the exact \"stuck forever\" symptom the original fix was meant to resolve.",
    changes: [
      "A pending muster attack now only promotes to fire once its funded flag is actually adjacent to the target (or a valid dock crossing), matching the check that decides whether it's allowed to fire.",
      "A funded-but-not-adjacent flag keeps the attack parked instead of bouncing it between the queues."
    ]
  },
  {
    createdAt: 1786568215911, // 2026.08.12.12
    introducedIn: "2026.08.12.12",
    title: "Fixed: manually targeted attacks rejected as NOT_ADJACENT from a ready flag",
    why: "The previous fix for stuck manual attacks (2026.08.12.11) made a fully mustered flag fire immediately whenever it was merely \"in range\" of the target (up to 20 tiles), not actually next to it. The server correctly rejects a non-adjacent attack, so those attacks failed outright instead of firing.",
    changes: [
      "A ready flag now only fires an attack directly when it's actually adjacent to the target (or a valid dock crossing).",
      "A ready flag that's in range but not adjacent stages/parks as before, so it can march into position instead of being rejected."
    ]
  },
  {
    createdAt: 1786550100000, // 2026.08.12.11
    introducedIn: "2026.08.12.11",
    title: "Fixed: manually targeted attacks from a ready muster flag never fired",
    why: "Steering an attack onto a specific enemy tile — rather than letting a flag's ADVANCE mode auto-pick a target — silently re-queued the attack forever instead of sending it, even once the flag held well over the required manpower. The flag would just sit there fully mustered and nothing would happen.",
    changes: [
      "Manually targeting an attack now fires immediately once a muster flag in range already has enough manpower staged, instead of endlessly re-parking the attack.",
      "Applies to both close-range flags and flags reached via a dock sea crossing."
    ]
  },
  {
    createdAt: 1786546500000, // 2026.08.12.10
    introducedIn: "2026.08.12.10",
    title: "Market renamed to Mintworks, with a new 3D overlay and icon",
    why: "\"Market\" read as a trading post, which isn't what the building does — it's the empire's gold-minting workshop, easy to confuse with the unrelated Market town archetype. Renamed the structure to Mintworks (town archetype naming is unaffected) and gave it a dedicated look worthy of the name: a giant mechanical coin press instead of the old fruit-stall-with-an-awning placeholder.",
    changes: [
      "The Market structure is now called Mintworks everywhere — build menu, tile info, tooltips, and the Development queue.",
      "Added a dedicated 3D overlay for Mintworks: a dark-iron industrial hall with a giant brass coin press, flywheel, gear train, rear furnace, ingot stocks, coin trays, and coin crates.",
      "Added a matching 2D flat-color Mintworks icon for the overlay gallery.",
      "Existing Market structures on the map keep working under the new name — no rebuild needed."
    ]
  },
  {
    createdAt: 1786545979000, // 2026.08.12.9
    introducedIn: "2026.08.12.9",
    title: "Fixed: Titanium/Umbrite Weapons Factory bonus was silently scoped to a single town network instead of empire-wide",
    why: "Titanium/Umbrite Weapons Factories were combat-relevant only if they happened to sit in the connected-town network nearest whichever tile was attacking or defending — build one at a second, disconnected town and it contributed nothing to a fight fought elsewhere. Nothing in the game ever told players this; the build tooltip and structure-info text actually claimed the opposite ('scoped to this town's connected network' read as intentional, not as a gotcha), and the just-added combat breakdown panel would have shown a number that quietly changed depending on which tile you attacked from. Weapons Workshop, the structure these replaced, was always empire-wide — this brings Weapons Factories in line with it.",
    changes: [
      "Titanium/Umbrite Weapons Factory attack/defense bonuses are now empire-wide: every active copy you own counts toward every fight, regardless of which town network it's connected to or how far it is from the battle.",
      "Build tooltips and structure-info text for both factories updated to say 'empire-wide' instead of the old (now incorrect) 'scoped to this town's connected network' claim.",
      "The live Launch Attack preview now actually includes Weapons Workshop/Weapons Factory bonuses and the 'no war industry' vulnerability penalty in its win-chance number — previously the preview omitted all three and only the resolved combat applied them, so the number shown before committing to an attack could be meaningfully wrong."
    ]
  },
  {
    createdAt: 1786543467000, // 2026.08.12.8
    introducedIn: "2026.08.12.8",
    title: "Added: a full \"show your work\" breakdown for combat power and win chance",
    why: "Win chance showed up as a single percentage with no way to see what produced it, and the Attack/Defense stats in the tech tab were shown as vague % deltas that didn't even correspond to the numbers combat actually used — worse, a couple of domains (Titanium Dominion, War Foundries) promised a flat attack/defense bonus in their description that silently never applied to any fight. Both are now the same real numbers: BASE_COMBAT_POWER x persistent infrastructure x this-battle modifiers.",
    changes: [
      "Tech tab's Attack/Defense stats now show the actual effective combat-power number (e.g. \"11.8\") instead of a % delta — press either stat to inspect every contributing multiplier.",
      "The Launch Attack button now shows a breakdown panel: each side's calculated base power (the same number the tech tab shows), the modifiers specific to this fight as a signed %, the resulting effective attack/defense, and the win-chance formula itself.",
      "Fixed: tech/domain flat attack/defense bonuses (e.g. Titanium Dominion's +18%/+18%, War Foundries' +8% attack) now actually apply to combat instead of only being displayed."
    ]
  },
  {
    createdAt: 1786536900000, // 2026.08.12.7
    introducedIn: "2026.08.12.7",
    title: "Fixed: Aether Purge (and other Observatory abilities) still asking for gold/crystal",
    why: "An earlier release dropped the stale price tags from the ability info panel, but the tile-targeting menu — the button you actually click to cast — had its own separate gold/crystal checks that were never touched, so Aether Purge still refused to fire below 3,000 gold. Aether EMP, Retort Recast, Create/Remove Mountain, and Launch Satellite had the same leftover checks.",
    changes: [
      "Removed the stale client-side gold/crystal gates on Aether Purge, Aether EMP, Retort Recast, Create Mountain, Remove Mountain, and Launch Satellite — casting them no longer requires resources they don't actually cost."
    ]
  },
  {
    createdAt: 1786533000000, // 2026.08.12.6
    introducedIn: "2026.08.12.6",
    title: "Fixed: zoom/pan stutter from the ownership tint overlay",
    why: "A CPU profile taken mid-zoom showed bufferSubData eating 65% of main-thread time. The ownership overlay's commit() set needsUpdate on its position/color/index buffers without scoping the upload range, so every terrain rebuild reuploaded the full worst-case buffer (sized for the whole tile budget across 4 mesh targets) instead of just the tiles actually written that frame — the same bug class as the heightfield skirt-buffer fix, in a different overlay.",
    changes: [
      "Ownership overlay buffer uploads are now scoped to the written tile range instead of reuploading the whole allocation on every rebuild, cutting zoom/pan jank."
    ]
  },
  {
    createdAt: 1786530294000, // 2026.08.12.5
    introducedIn: "2026.08.12.5",
    title: "Fixed: Activity Feed timestamps stuck showing raw minutes forever",
    why: "Feed entries persist for a session, so their age can run from seconds to months, but the timestamp label only ever scaled up to whole minutes — an entry from 14 hours ago read as '833m ago' instead of converting to hours, days, weeks, or months.",
    changes: [
      "Activity Feed timestamps now scale through s/m/h/d/w/mo depending on age, instead of showing raw minutes no matter how old the entry is."
    ]
  },
  {
    createdAt: 1786528967000, // 2026.08.12.4
    introducedIn: "2026.08.12.4",
    title: "Fixed: attack outcomes (manpower spent, gold/resources plundered) never actually reached the Activity Feed",
    why: "The simulation computed a full combat outcome for every resolved attack — manpower spent, gold and resources plundered — but the gateway never forwarded that event to the attacker. combatResolutionAlert() and the client's COMBAT_RESULT listener had been dead code on the wire since the rewrite-stack gateway shipped; the only feedback an attacker ever got was the tile silently changing hands.",
    changes: [
      "Attack results now post a real Activity Feed entry naming manpower lost and, on a win, gold/resources plundered — not just a tile flip.",
      "The player being raided now also gets their own Activity Feed entry (with a Go to tile button) naming the attacker and what was pillaged from them — previously they got nothing beyond the pre-resolution 'under attack' alert."
    ]
  },
  {
    createdAt: 1786526599000, // 2026.08.12.3
    introducedIn: "2026.08.12.3",
    title: "Development queue now fills silently once it hits its total cap",
    why: "The total dev-queue cap exists as a defensive backstop, not something players are meant to actually hit in normal play — but the 'Development queue is full' Activity Feed warning fired as if it were a real, expected rejection, which read as broken rather than as the edge case it is.",
    changes: [
      "Queuing an action once the development queue is at its total cap no longer posts an Activity Feed warning — the action is silently dropped, matching how an already-queued action is already handled."
    ]
  },
  {
    createdAt: 1786528000000, // 2026.08.12.1
    introducedIn: "2026.08.12.1",
    title: "Aether abilities are now free of gold and crystal cost",
    why: "Most Observatory aether abilities were already free server-side, but the info panel still showed stale gold/crystal price tags. A few abilities (mountain shaping, satellite launch) did charge real gold. Both are now free, and the panel no longer shows a Cost row for any ability.",
    changes: [
      "Removed the gold cost checks for Create Mountain, Remove Mountain, and Launch Satellite — they're free to cast now.",
      "The ability info panel no longer shows a Cost row for any Observatory ability."
    ]
  },
  {
    createdAt: 1786622000000, // 2026.08.13.3
    introducedIn: "2026.08.13.3",
    title: "Mintworks flywheels and Umbrite reactor cores now move",
    why: "The relay beacon's slowly rotating mirror array reads beautifully on the landscape, but the other high-tier buildings sat perfectly still. The mintworks' brass flywheel and the Umbrite weapons factory's reactor core both deserved a small touch of the same idle motion, so the world keeps a consistent, living feel at gameplay distance.",
    changes: [
      "The Mintworks flywheel assembly (wheel, spokes, hub and rim) now spins slowly, like its drive machinery is running.",
      "The Umbrite weapons factory's reactor core now gently pulses — the core, fissures and embers breathe in and out like contained power.",
      "Every structure picks its own phase from its tile, so neighbouring buildings never pulse or spin in sync."
    ]
  },
  {
    createdAt: 1786723412408, // 2026.08.14
    introducedIn: "2026.08.14",
    title: "Towns now grow from a frontier settlement into a magnificent steampunk metropolis",
    why: "Towns all shared one generic hut-cluster look, so the biggest, most important settlements on the map were visually indistinguishable from the smallest. Each tier of your civilization is now a cohesive miniature city built in a single evolving steampunk style — dark iron, weathered brass, timber, stone, warm amber lamps and glowing aether machinery — from a frontier aether workshop up to a colossal three-part wonder.",
    changes: [
      "SETTLEMENT — Frontier Spark: a compact aether-powered workshop with a glowing aether core, brass machinery, pressure tanks, timber cottages and warm lamps.",
      "TOWN — Growing Industry: a clockwork aether hall with turret, mechanical crane, elevated walkway and expanding pipe networks.",
      "CITY — Industrial Metropolis: a dense civic engine with factories, brass towers, elevated bridges and steam vents.",
      "GREAT_CITY — Imperial Powerhouse: a domed civic complex with an elevated transit loop, gear spire, beacon and clock tower.",
      "METROPOLIS — Wonder of the World: the colossal three-part Monument towers over dense districts, transit bridges and glowing aether conduits.",
      "The 2D town icons match the new 3D look tier-for-tier, and settlement growth is otherwise mechanically unchanged."
    ]
  },
  {
    createdAt: 1786739629437, // 2026.08.14
    introducedIn: "2026.08.14",
    title: "The Monumental City now truly towers over the map as a wonder of the world",
    why: "The top-tier Monumental City was impressive but not dramatic enough to feel like a wonder of the world. The Monument now rises far above the skyline as an unmistakable three-part wonder, dwarfing the Great City below it.",
    changes: [
      "METROPOLIS — Wonder of the World: the central Monument is now much taller and grander, with extra stepped brass shafts, integrated gear decks and a soaring needle crowned by a luminous aether orb.",
      "The 2D metropolis icon was redrawn to match the taller Monument, and everything remains mechanically unchanged."
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
