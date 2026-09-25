import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_88: ClientChangelogEntry[] = [
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
];
