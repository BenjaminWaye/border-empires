// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
// The "keeps only the latest week" test drops any entry whose createdAt is
// more than 6 days before the newest entry -- when a new entry's timestamp
// ages an earlier-N file's entries out of that window, remove that file's
// import and spread below (the .ts file itself can stay as a historical
// record, just unreferenced) rather than leaving a stale import.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_3 } from "./client-changelog-data-earlier-3.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_4 } from "./client-changelog-data-earlier-4.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_5 } from "./client-changelog-data-earlier-5.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_7 } from "./client-changelog-data-earlier-7.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_10 } from "./client-changelog-data-earlier-10.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_11 } from "./client-changelog-data-earlier-11.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_14 } from "./client-changelog-data-earlier-14.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_16 } from "./client-changelog-data-earlier-16.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_17 } from "./client-changelog-data-earlier-17.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_18 } from "./client-changelog-data-earlier-18.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_20 } from "./client-changelog-data-earlier-20.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_27 } from "./client-changelog-data-earlier-27.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_29 } from "./client-changelog-data-earlier-29.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_33 } from "./client-changelog-data-earlier-33.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_34 } from "./client-changelog-data-earlier-34.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_36 } from "./client-changelog-data-earlier-36.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_37 } from "./client-changelog-data-earlier-37.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_48 } from "./client-changelog-data-earlier-48.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_49 } from "./client-changelog-data-earlier-49.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_50 } from "./client-changelog-data-earlier-50.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_52 } from "./client-changelog-data-earlier-52.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_53 } from "./client-changelog-data-earlier-53.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_55 } from "./client-changelog-data-earlier-55.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_56 } from "./client-changelog-data-earlier-56.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_57 } from "./client-changelog-data-earlier-57.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_58 } from "./client-changelog-data-earlier-58.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_60 } from "./client-changelog-data-earlier-60.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_61 } from "./client-changelog-data-earlier-61.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_62 } from "./client-changelog-data-earlier-62.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_63 } from "./client-changelog-data-earlier-63.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_64 } from "./client-changelog-data-earlier-64.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_65 } from "./client-changelog-data-earlier-65.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_67 } from "./client-changelog-data-earlier-67.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_68 } from "./client-changelog-data-earlier-68.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_69 } from "./client-changelog-data-earlier-69.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_72 } from "./client-changelog-data-earlier-72.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_73 } from "./client-changelog-data-earlier-73.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_75 } from "./client-changelog-data-earlier-75.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const RECENT_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1789656367093, // frozen, one past the previous newest entry
    introducedIn: "2026.09.18.1",
    title: "New seasons now require a player vote to start",
    why: "A season could auto-start on its own an hour after the previous one ended, even if players hadn't voted -- skipping past the old season's scoreboard before anyone chose to move on.",
    changes: [
      "Removed the automatic season-start timer -- a new season now only begins once players vote for it",
      "Lowered the votes needed to start a new season from 5 to 2"
    ]
  },
  {
    createdAt: 1789656367092, // frozen, one past the previous newest entry
    introducedIn: "2026.09.17.7",
    title: "Clickable player names now show an underline",
    why: "Player names that open a profile card (in tile descriptions, the leaderboard, etc.) looked like plain text, so the fact they were clickable wasn't discoverable.",
    changes: [
      "Clickable player names now show a dotted underline to make it clear you can click them to open the player's profile card"
    ]
  },
  {
    createdAt: 1789549757916, // frozen, 1ms after the "Barbarian camps start larger" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.3",
    title: "Fixed the CRYSTAL economy panel undercounting Aether Towers",
    why: "The \"Occupied by\" breakdown under the CRYSTAL resource panel only read a tile's fort, siege outpost, and economic-structure fields when tallying who was using a slot. Aether Towers (Observatories) are tracked as their own separate tile field, so every Aether Tower's CRYSTAL slot was invisible to this breakdown -- the panel could show a used/total ratio like 69/55 while the visible per-building list only summed to 14.",
    changes: [
      "The CRYSTAL \"Occupied by\" list now includes Aether Towers, so the visible breakdown adds up to the total slots used"
    ]
  },
  {
    createdAt: 1789549757915, // frozen, 1ms after the "Fixed the server stall..." entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.2",
    title: "Barbarian camps start larger",
    why: "Barbarian starting camps were seeded with only 20 tiles, making them a trivially quick clear for most empires early on. Bumping the seed size gives barbarians a bit more early staying power without changing their separately-capped growth ceiling.",
    changes: [
      "Barbarian camps now start with up to 30 tiles instead of 20"
    ]
  },
  {
    createdAt: 1789549757914, // frozen, 1ms after the "Stage Muster per season" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.1",
    title: "Fixed the server stall that blocked logins on 2026-09-17",
    why: "A live CPU profile of the game server showed roughly 40% of all its work going into re-computing one player's auto-settle queue (which frontier tiles qualify for free settling) from scratch on every state update and three times per 30-second automation tick -- about 10,000 town-support ring scans each time, to produce a 2-entry list. That steady load exhausted the server's shared-CPU budget, the host throttled it to a fraction of a core, every tick took seconds, and logins timed out at \"Loading your world state\". The queue was already cached for AI empires, but not for human players, on the assumption that humans trigger it rarely -- it is actually driven by state updates, not by settling.",
    changes: [
      "The auto-settle queue is now cached for every player and only recomputed when that player's tiles actually change (at most once per 5 seconds, and always within 60 seconds), instead of on every state update",
      "In practice the queue you see can lag a real change by up to a few seconds; settling itself is unchanged"
    ]
  },
  {
    createdAt: 1789549757913, // frozen, 1ms after the "New spawns land a safe distance from towns" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.8",
    title: "Stage Muster now unlocks on barbarian contact and remembers across devices, per season",
    why: "The Stage Muster tile action stays hidden until a player has met someone worth attacking, but the unlock only counted rival empires -- a player whose nearest neighbour was a barbarian camp had no way to muster against it -- and it was only remembered in the browser, so a data clear or a second device re-locked it until the next enemy sighting.",
    changes: [
      "Seeing a barbarian-held tile now unlocks Stage Muster and the First Contact tip, the same as seeing a rival empire",
      "The unlock is saved to your account on the server (alongside dismissed hints and the onboarding checklist), so it follows you across browsers and devices",
      "The unlock is scoped to the current season -- a fresh season is a new map with no enemies met yet, so it re-locks until you meet one again, same as a brand-new player"
    ]
  },
  {
    createdAt: 1789549757912, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.07",
    title: "New spawns now land a safe distance from the nearest town",
    why: "A new player's spawn tile could land right next to an existing town, letting them settle it within their first couple of moves instead of exploring their surroundings first.",
    changes: [
      "New spawns (including rally spawns) now keep at least 5 tiles of distance from the nearest town, so joining a game no longer hands you an instant settle target"
    ]
  },
  {
    createdAt: 1789549757911, // frozen, 1ms after the "Cancel All Waypoints" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.6",
    title: "Watchtower and Waystation sites now actually reach your screen",
    why: "Even after the previous fix made Watchtower and Waystation sites survive into a season's starting map, two more field-whitelist gaps of the exact same shape kept them invisible in practice: the sim's own boot/restart hydration path silently dropped both fields when reloading tiles from a checkpoint (so a restart -- including a routine deploy -- could wipe them right back out), and the login/reconnect map export never included them in the payload sent to your client in the first place, unlike every sibling site type (docks, natural wonders, shard sites, etc.).",
    changes: [
      "Fixed sim checkpoint/restart hydration so Watchtower and Waystation sites survive every restart, not just initial season generation",
      "Fixed the login and reconnect map export so Watchtower and Waystation sites are actually sent to your client instead of being silently stripped"
    ]
  },
  {
    createdAt: 1789549757910, // frozen, 1ms after the newest existing entry ("warty terrain fix") -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.4",
    title: "Added a Cancel All Waypoints action to the tile menu",
    why: "A queued waypoint targeting a tile outside your current view -- for example one set by an accidental click just before you signed in -- had no way to be cancelled, since the only cancel option required selecting that exact tile.",
    changes: [
      "Opening the action menu on any of your tiles now offers \"Cancel All Waypoints\" whenever you have any queued, letting you clear the whole list without needing to find the specific tile a waypoint targets"
    ]
  },
  {
    createdAt: 1789549757909, // frozen, 1ms after the newest existing entry ("steampunk visual pass") -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.3",
    title: "Toned down the 3D grass/sand/tundra surface bump so it no longer looks warty",
    why: "A recent pass pushing the 3D terrain's painterly art style further sharpened the ground's normal-map strength, its per-material normal scale, and the spread of its roughness values all at once. Stacked together, those three changes made the low-frequency height noise that shapes the surface read as a dense field of small pits and bumps -- especially visible on grass and sand -- instead of a subtle painterly texture.",
    changes: [
      "Lowered the terrain normal-map bake strength and the heightfield material's normal scale back toward their pre-pass values",
      "Narrowed the roughness contrast between surface pits and ridges back toward its pre-pass range",
      "2D canvas fallback renderer is unaffected -- it has no equivalent per-pixel bump/roughness noise system"
    ]
  },
  {
    createdAt: 1789549757907, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.1",
    title: "Hills read as gentle, connected highland rather than a stamped pointy peak",
    why: "Hill tiles used to render as one or three sharply pointed mounds, and two adjacent hill tiles never actually joined up -- the connecting bridge between them tapered to nothing just short of the shared edge, so a hill patch or ridge always looked like separate stamped bumps with thin gaps between them. Separately, the ownership tint draped over a hill used a coarser mesh than the hill's own surface, letting a sliver of the water/fog colour underneath show through as a light-blue glitch.",
    changes: [
      "Hills are now a broad, irregular, almost-flat raised mound with 3 small, barely-noticeable points, sloping gently down to ground level at the tile edge",
      "Two hill tiles that are cardinal neighbours now visibly merge into one connected landmass instead of leaving a gap at their shared border",
      "Fixed a light-blue glitch in the settled-tile ownership tint where it drapes over a hill"
    ]
  },
  {
    createdAt: 1789549757906, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.16.04",
    title: "Fixed: \"settle + build\" settled the tile but never started the building",
    why: "Queueing a building on your own frontier ground (\"settle + build Relay Beacon\" and every other chained build) hands the follow-up build to the server, so it still completes if you disconnect mid-settle. But the server only ever ran that queue while you were offline -- the whole point being that your own client runs it while you're connected. The follow-up build was written into a queue your client can't see and the server had stood down from, so for anyone who simply stayed in the game and watched, it sat there forever: the tile settled, and nothing was ever built on it.",
    changes: [
      "\"Settle + build\" now actually starts the building once settling finishes while you're still connected, instead of settling the tile and silently stopping there",
      "This covers every chained build on owned frontier ground, including the one queued behind an in-flight expansion -- Relay Beacon was just the most common way to hit it",
      "A queued follow-up build no longer gets stuck behind other things in your build queue, and if all your build slots are busy when settling finishes it now starts as soon as a slot frees instead of being dropped",
      "Foundry and Waterworks are unchanged: those still ask you to pick the exact tile yourself, so they stay client-driven",
      "Fixed a related leak where each \"settle + build\" left a dead entry occupying one of your queue slots (and holding onto its reserved manpower) until you reconnected"
    ]
  },
  {
    createdAt: 1789549757905, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.16.03",
    title: "Watchtower and Waystation sites now actually appear in new seasons",
    why: "The season worldgen pipeline correctly placed Watchtower and Waystation sites on the map, but a field-whitelist step that copies each generated tile into the season's persisted starting state never included those two fields alongside similar site types like docks and natural wonders, so every placed site was silently dropped before the season ever went live. This affected every season generated so far -- players who never found a Watchtower or Waystation weren't missing them by chance, the sites were never actually there.",
    changes: [
      "Fixed the season worldgen pipeline so Watchtower and Waystation sites placed by the generator now survive into the live map",
      "Only affects seasons generated after this ships -- the currently running season's map is unchanged"
    ]
  },
  {
    createdAt: 1789549757904, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.16.02",
    title: "Fixed: owned frontier ground stuck with no reach and no path back after a server restart",
    why: "The persistent reach border isn't saved to disk -- it's rebuilt at boot from your towns/outposts/docks currently active right now, replaying the same contest a live anchor activation uses. A live empire's border grows past those anchors' base radius over a session (EXPAND pushes it outward tile by tile), and that accumulated growth isn't anchor geometry, so a restart's replay can't reproduce it. A tile you still owned but that sat outside every current anchor's disk came back from a restart with no reach and, because nothing ever re-evaluates an already-owned tile's coverage outside of a live anchor loss, no way to ever resolve on its own -- it just sat there permanently, reading as if it belonged to someone else.",
    changes: [
      "After a restart, an owned frontier tile the reach border doesn't currently cover now starts the same out-of-reach countdown a live anchor loss would give it, instead of sitting in permanent limbo -- it resolves within that window by regaining reach (if an anchor still covers it once re-evaluated) or reverting to neutral ground, matching how undefended frontier is meant to behave everywhere else",
      "This never grants reach outright and never touches ground a rival's live reach is already contesting, so it can't resurrect the earlier reach/ownership mismatch bug the boot-time border contest exists to prevent"
    ]
  },
  {
    createdAt: 1789541688935, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.16.01",
    title: "Fixed: attacking an enemy's frontier tile no longer shows the claim sweep over still-enemy-colored ground",
    why: "Instant-capturing an undefended frontier tile reuses EXPAND's \"becoming mine\" plate sweep in the 3D renderer. That looks right for a real EXPAND target, which has no owner tint to begin with, but an ATTACK on an enemy's frontier tile keeps that enemy's color tinting the tile the whole time -- ownerId only actually changes once the server resolves the capture. The sweep ended up animating on top of ground that never visually went neutral first, instead of the intended neutral-then-mine transition.",
    changes: [
      "The 3D map now hides a frontier tile's owner tint for the duration of an ATTACK claim against it (this client's own manual attack or a muster flag's auto-fire), so the target reads as neutral ground while the claim-plate sweep fills it in with your color, matching a real EXPAND target",
      "The 2D renderer never had this per-tile sweep animation (it only shows the \"Capturing Territory...\" progress banner), so it had no equivalent visual mismatch to fix"
    ]
  },
  {
    createdAt: 1789417055105, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.03",
    title: "Waystation activation popup now has hero art",
    why: "The Waystation activation reward popup was plain text on a dark panel -- eyebrow label, coordinates, one line of copy -- despite its own PR description claiming it was visually modeled on the Town Captured popup, which has a hand-illustrated skyline hero. That gap was easy to miss because nothing in the code or the popup itself called it out.",
    changes: [
      "Activating a Waystation now shows a hero illustration of the frontier rig (mast, glowing lens, roofed shelter, crates) above the reward text, matching the Town Captured popup's visual treatment",
      "The reward copy now reads as a narrative sentence (e.g. naming the actual town a Population burst moved into) followed by a bold \"Modifiers\" line with the concrete effect",
      "The Population reward now offers a \"Jump to Town\" button, and the Tech reward's \"Unlocked: <name>\" line is now clickable and opens that tech's detail panel"
    ]
  },
  {
    createdAt: 1789417055104, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.08",
    title: "Siege Tower and Dread Tower beams open the fight by taking out a defender",
    why: "The siege tower's aether lens already swung to track and beam an ongoing battle, but the beam never appeared to do anything -- marines fell purely on their own combat-resolved schedule with no visual link to the tower supposedly firing on them. This ties the two together: when a real Siege Tower or Dread Tower is beaming a tile, the beam now strikes down a defender right as combat starts, opening the fight.",
    changes: [
      "While a Siege Tower or Dread Tower is beaming a battle, its lance now strikes an actual defending unit combat resolution already scheduled to fall, right as the fight begins -- this attributes an existing casualty to the tower and moves only that one unit's own visual death timing up to the start of the fight; it never changes who wins, who dies, or the units' own combat rolls",
      "No change when no siege tower is present, or when the tower is aimed at a different battle -- the beam stays purely decorative in that case, as before"
    ]
  },
  {
    createdAt: 1789417055103, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.07",
    title: "Battles open with a blue-violet opening strike",
    why: "A squad's approach march used to lead straight into the firefight with no beat marking the transition, so combat felt like it just started rather than being kicked off by anything. A single lance now drops onto the tile right as the approach ends, giving the clash a clear opening shot before the marines' own empire-colored bolts take over.",
    changes: [
      "A blue-violet lance now strikes down onto a battle tile in the last moment before a squad's firefight begins, landing right as combat commences",
      "This opening strike is separate from the empire-colored bolts marines trade during the fight itself -- it's a one-time cosmetic beat, not a new combat mechanic"
    ]
  },
  {
    createdAt: 1789417055102, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.06",
    title: "Siege towers rise as towering aether artillery",
    why: "The upgraded siege variants (Siege Tower and its Dread Tower successor) shared the Siege Battery's compact carriage, so a max-tier siege engine looked like a planted cannon instead of the looming war machine its stats describe. They're now distinct towers: a heavy black-iron lattice braced on stabilizer legs, one enormous glowing aether lens in a brass gimbal, and a cyan-violet beam that swings down at the latest ongoing battle.",
    changes: [
      "Siege Tower and Dread Tower now render as tall black-iron towers with a huge glowing aether lens instead of the Siege Battery's low cannon carriage",
      "Each tower's lens swings to track the most recently started ongoing battle, firing a beam that fades in while the fight is live and dims the moment it ends",
      "New \"Siege Tower Aim\" setting in the Gameplay settings lets you choose between aiming just the aether lens or rotating the whole tower toward the battle"
    ]
  },
  {
    createdAt: 1789417055101, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.02",
    title: "Waystations now grant one random reward instead of all four at once",
    why: "Activating a Waystation granted every one of its four effects (map reveal, population burst, free tech, resource slot) simultaneously, every time -- a guaranteed grab-bag rather than a reward with any variance. Waystations are common enough (~1 per 400 tiles) that this made each activation feel like a checklist instead of a discovery.",
    changes: [
      "Expanding onto a Waystation now grants exactly ONE of the four rewards, chosen at random, instead of all four at once",
      "The map-reveal reward now centers on the nearest town within range (any owner) instead of the Waystation's own tile, so it points you at something worth knowing about -- falls back to revealing around the Waystation itself if no town is nearby",
      "The free-tech reward now grants a random tier-1 tech you don't already own, instead of always granting the same fixed tech",
      "The resource-slot reward now adds its +1 slot to whichever of Food/Titanium/Crystal/Umbrite your empire currently has the fewest slots of, instead of bumping all four at once",
      "A new popup now shows exactly which reward you received when you activate a Waystation"
    ]
  },
  {
    createdAt: 1789417055100, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.01",
    title: "Fixed a false-positive fatal-error screen on some map tile clicks",
    why: "Clicking between location tiles quickly could interrupt the location's one-shot sound effect mid-play, which browsers report as a harmless rejected play() promise. That rejection wasn't caught, so it tripped the app's global error guard and showed the full-screen \"Border Empires hit a problem loading\" reload overlay even though nothing was actually broken.",
    changes: [
      "A rapid location-tile theme change no longer triggers the fatal \"hit a problem loading\" reload screen"
    ]
  },
  {
    createdAt: 1789249191264, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.05",
    title: "Tile info panel now names the structure built on the tile, with a link to its details",
    why: "Selecting a tile with a Fort, Siege Outpost, Observatory, or any economic structure (Mintworks, Granary, etc.) on it gave no indication anywhere in the panel of what was actually built there.",
    changes: [
      "The tile info panel's overview now shows a \"Built: <structure>\" line naming whichever structure is on the tile",
      "That structure name is a clickable link that opens the same structure detail overlay already used by the Tech Tree and HUD economy panel"
    ]
  },
  {
    createdAt: 1789549757915, // frozen, 1ms after the "Fixed the server stall..." entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.15.01",
    title: "Barbarian tiles (\"The Bleed\") now show a Voidcrystal Colossus instead of a skull marker, with a real battle when it fights",
    why: "The 3D map's barbarian-territory marker was a plain procedural skull-on-a-pole icon, and a routine frontier capture popped instantly with no transition at all -- and when the Bleed fought over a settled tile (winning or losing), there was no visual for the fight itself. It's replaced with a sculpted Voidcrystal Colossus unit that reacts to territory changing tile-by-tile (there's no server-side \"barbarian unit\" to animate directly, so this is inferred client-side from tile-ownership changes and the real combat broadcast): every capture walks to the new tile first, then fights in place there only when it was actually a fight (a settled tile), with a defender marine squad firing back and dying one by one on a win. Player-facing text now calls this faction \"The Bleed\" instead of \"Barbarians\" -- internal identifiers (ownerId, code, file names) are unchanged.",
    changes: [
      "True-3D renderer: every Bleed-owned tile shows a Voidcrystal Colossus model. Capturing a settled (town/structure) tile walks to that tile first, then plays the model's real Attack animation in place while a defender marine squad fires laser bolts back and dies one at a time as the Bleed wins; capturing frontier/neutral land skips the fight and just walks there. A standing colossus holds a still pose -- no idle sway",
      "True-3D renderer: the Bleed can also LOSE a fight -- either attacking a defended tile and failing, or being the one defeated by a player -- in which case the colossus appears at the fought-over tile, its marine opponents hold the line, and it dissolves into a puff of blue smoke instead of surviving to stand there",
      "True-3D renderer: a Bleed tile eating neutral or frontier land (including another player's unsettled frontier tile, treated the same as bare wilderness) now fades its tile tint in over the capture instead of popping to the new color instantly",
      "2D canvas renderer (accessibility fallback): the barbarian skull icon is replaced with a matching crystalline-colossus glyph; this path does not animate captures, battles, or tile-tint transitions the way the 3D renderer does, since it has no per-frame state to track a marker's movement or a fight across tiles",
      "Player-facing text (tile owner labels, alerts, tech copy, the discovery tip) now says \"The Bleed\"/\"Bleed\" instead of \"Barbarians\"/\"barbarian\""
    ]
  },
  {
    createdAt: 1789249191263, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.04",
    title: "AI empires no longer freeze up fighting barbarians",
    why: "A rejected ATTACK command put the entire ATTACK decision class on a 10-second cooldown, regardless of why it was rejected. On a barbarian border -- which can flip dozens of times a day as the barbarian faction expands and multiplies -- the AI's chosen target frequently changed hands between planning the attack and it landing, rejecting the command with \"target must be enemy-controlled land\" and cooling ATTACK down again. That produced a self-sustaining loop that kept some AI empires effectively frozen at their barbarian border, unable to attack, even while every other sign said they were ready and willing to fight.",
    changes: [
      "AI empires now only go on ATTACK cooldown when the rejection means resubmitting the same attack would fail again (e.g. the tile is still locked in combat) -- a rejection caused by the target simply changing hands no longer blocks the AI from immediately picking a new target and attacking again"
    ]
  },
  {
    createdAt: 1789249191262, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.03",
    title: "Fixed Siege Outpost, Siege Tower, and Dread Tower rejected on frontier tiles",
    why: "Siege outposts are meant to only require ownership, not settlement, so they can be built on frontier land -- but the tile-surface check that gates the build menu and the BUILD command never had a case for an owned, unsettled (FRONTIER) tile with no resource/town/dock on it, so a bare frontier tile always failed with \"siege outpost cannot be built on this tile\" even though the rest of the build path already allowed it.",
    changes: [
      "Siege Outpost, Siege Tower, and Dread Tower can now be built on any owned frontier tile, not just settled/resource/town/dock tiles"
    ]
  },
  {
    createdAt: 1789249191261, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.02",
    title: "Galaxy View launcher no longer overlaps the mobile minimap",
    why: "The minimap's label always renders as a bordered/padded toolbar box (e.g. \"Minimap (12, 34)\"), not plain text, so it's taller than a first pass assumed -- the Galaxy View launcher's clearance above it was 30px short, and the launcher visibly overlapped the minimap's top edge on real devices.",
    changes: [
      "The Galaxy View launcher on mobile now clears the minimap's actual (taller) height, verified with a headless render of the real minimap markup instead of a plain-text stand-in -- no more visible overlap"
    ]
  },
  {
    createdAt: 1789249191260, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.01",
    title: "Minimap moved down to the bottom of the screen on mobile",
    why: "On mobile the minimap sat with a large fixed gap above the bottom nav bar, leaving a lot of dead map space below it and pushing the Galaxy View launcher awkwardly high (close enough to the minimap to look like it overlapped it).",
    changes: [
      "The minimap now sits right above the bottom nav bar on mobile instead of floating with a big gap underneath it, freeing up more of the screen for the map",
      "The Galaxy View launcher sits just above the minimap's new, lower position instead of needing to clear as much space"
    ]
  },
  {
    createdAt: 1789249191259, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.04",
    title: "Galaxy View button moved above the minimap on mobile",
    why: "On mobile the 🌌 Galaxy View launcher was anchored just above the bottom nav bar, which put it below/behind the minimap panel instead of clear of it.",
    changes: [
      "On mobile, the Galaxy View launcher now sits above the minimap instead of tucked in behind it near the bottom nav bar"
    ]
  },
  {
    createdAt: 1789255054252, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.13.1",
    title: "Fixed a defended tile briefly flashing neutral when you attacked it",
    why: "A tile you attacked (or that had an active attack lock on it, as either side) could render as unowned/neutral for a split second, even though it never actually changed hands -- most reliably reproduced on a failed/repelled attack against an already-owned, defended tile. Two separate server code paths were building a tile update that omitted ownerId/ownershipState instead of including their real (unchanged) values, which the client always reads as an explicit ownership clear.",
    changes: [
      "A tile visible to you only because you have an active attack lock on it now still reports its real owner instead of stripping ownership info entirely",
      "A repelled attack against a defended tile no longer sends a battle-effect update that omits the tile's ownership, which was momentarily flashing it neutral client-side"
    ]
  },
  {
    createdAt: 1789375785264, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.02",
    title: "The main game HUD got a steampunk-futuristic visual pass -- brass, copper, riveted panels",
    why: "The core HUD chrome (login screen, panel frames, buttons, resource readouts, progress bars) used a generic dark sci-fi-dashboard palette that didn't feel distinct to this game or match Space View's existing steampunk redesign.",
    changes: [
      "New brass/copper/verdigris/aged-leather color palette and Cinzel (headers) + Spectral (body) + Space Mono (numeric readouts) fonts applied across the base HUD background, login/auth screen, side panels, and shared buttons",
      "The login screen's card is now a riveted brass-bordered panel with an engraved inner bevel instead of a soft rounded modern card",
      "Resource pills, the top strip, and side-panel frames now use brass borders and an aged-leather background instead of the old cold blue-gray",
      "Build/queue progress bars now read as analog brass pressure gauges -- tick-marked track, warm glowing brass fill -- instead of a flat modern progress bar",
      "Individual feature panels (fleet, senate, muster, tech tree, season lobby, etc.) still use their prior colors in this pass -- broader coverage is a follow-up"
    ]
  },
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
  },
  {
    createdAt: 1789549757916, // frozen, newer than every existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.2",
    title: "Auto-settle now starts the instant a tile qualifies, instead of waiting up to 30 seconds",
    why: "The previous fix (2026.09.17.1) cached the auto-settle queue instead of rebuilding it from scratch, but every cache rebuild still re-scanned every one of a player's frontier tiles, including a wide town-support scan for tiles already known not to qualify. That kept a steady, avoidable cost on the server for large empires. Auto-settle now tracks eligibility directly at the moment it can actually change -- claiming a tile, a town growing a tier, a town changing hands, or a relevant tech finishing research -- instead of periodically re-checking everything.",
    changes: [
      "A tile that qualifies for free auto-settle (already inside your border, next to a big-enough town, or newly tech-revealed) now starts settling the same instant it qualifies, if a settle slot is free, instead of up to 30 seconds later",
      "When a settle finishes and frees up a slot, the next eligible tile now starts immediately instead of waiting for the next automation pass",
      "No other change to auto-settle's cost, manpower, or timing once started"
    ]
  },
  {
    createdAt: 1789549757917, // frozen, one past the previous newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.3",
    title: "Server no longer re-scans the whole world on every income tick (prod stall fix)",
    why: "Three server hot spots kept the production simulation over its CPU budget even after the auto-settle fixes earlier today, which the host then throttles until logins and commands stall. Every 15-second income update scanned all 202,500 world tiles per player just to count Weapons Factories; every minute the population-growth pass threw away each player's cached economy for no reason (growth doesn't change income -- only a town's tier or fed status does), forcing a full re-derivation of large empires' economy and trade network; and the metrics endpoint sorted every latency series three times per scrape.",
    changes: [
      "Weapons Factory counts in the Manpower/Combat modifier breakdown are now read from the same live structure index combat already uses, so the breakdown always matches the multiplier actually applied in battle",
      "Population growth no longer forces an economy recompute unless a town's fed status actually changed",
      "No gameplay, cost, or timing changes -- this is purely server load"
    ]
  },
  {
    createdAt: 1789549757918, // frozen, one past the previous newest entry
    introducedIn: "2026.09.17.4",
    title: "Mobile bottom tab bar reskinned to match the rest of the UI",
    why: "The steampunk reskin pass covered other shared chrome and feature panels (Fleet, Senate, tech detail, etc.) but never touched the mobile bottom navigation bar, so it was the last piece of the UI still showing the old plain dark/blue palette.",
    changes: [
      "Mobile tab bar now uses the brass/copper/parchment palette and fonts shared with the rest of the reskinned UI",
      "No layout or behavior changes -- colors and fonts only"
    ]
  },
  {
    createdAt: 1789656367089, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.17.5",
    title: "Hill tiles no longer show a black seam where they meet the coast (true-3D map)",
    why: "A hill tile's dome edge is stitched to match the main terrain grid's own corner heights, but the main grid additionally pins any corner touching the sea to a fixed coastal elevation instead of just averaging its land neighbours. The hill dome's edge stitching didn't know about that pin, so a corner where a hill bordered the coast used a plain land average while the main grid's matching corner used the lower coastal pin -- the two disagreed, and the dome edge sat above the real coast level with its underside/skirt showing through as a black seam.",
    changes: [
      "A hill tile's dome edge now matches the main grid's coastal pin at any corner touching the sea, instead of sitting above it -- fixes a black seam sticking up where a hill tile's edge met the coastline on the true-3D map",
      "2D canvas renderer unaffected -- it doesn't build a 3D dome mesh for hill tiles, so this seam never applied there"
    ]
  },
  {
    createdAt: 1789656367090, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.6",
    title: "Tile menu now shows an ongoing battle's odds",
    why: "Pressing a tile you were attacking, or one of your own tiles under attack, showed nothing about the fight -- no attacker, no timer, no sense of who was favored.",
    changes: [
      "Attacking a tile now shows a \"Battle in progress\" card with a two-color odds bar (your color vs the defender's) built from the same pre-battle win chance shown on the Launch Attack button, plus a countdown to when it resolves",
      "One of your own tiles under attack now shows an \"Under attack\" card naming the attacker and counting down to resolution (the odds bar there is a neutral split -- the defender doesn't get to see the attacker's calculated odds)"
    ]
  },
  {
    createdAt: 1789656367091, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.7",
    title: "Player stat updates during heavy combat are batched (prod stall fix, part 2)",
    why: "Every single attack resolution pushed a full player stat update (gold, manpower, integrity, slots) to both sides, and building one recomputes the whole empire's economy and defensibility -- for a 14,000-tile empire under muster auto-fire that was happening many times a second and starved the server, causing this evening's \"simulation unavailable\" errors.",
    changes: [
      "During a burst of actions, your first stat update still arrives instantly; further updates within the same second are combined into one, sent at the end of that second",
      "Map updates, combat results, and command confirmations are not affected -- only the gold/manpower/integrity panel refresh is rate-limited",
      "No gameplay, cost, or timing changes"
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_3,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_4,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_5,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_7,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_10,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_11,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_14,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_16,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_17,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_18,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_20,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_27,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_29,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_33,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_34,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_36,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_37,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_48,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_49,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_50,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_52,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_53,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_55,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_56,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_57,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_58,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_60,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_61,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_62,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_63,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_64,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_65,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_67,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_68,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_69,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_72,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_73,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_75
];
