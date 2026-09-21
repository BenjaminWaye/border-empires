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
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_52 } from "./client-changelog-data-earlier-52.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_55 } from "./client-changelog-data-earlier-55.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_56 } from "./client-changelog-data-earlier-56.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_58 } from "./client-changelog-data-earlier-58.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_61 } from "./client-changelog-data-earlier-61.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_62 } from "./client-changelog-data-earlier-62.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_67 } from "./client-changelog-data-earlier-67.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_68 } from "./client-changelog-data-earlier-68.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_69 } from "./client-changelog-data-earlier-69.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_77 } from "./client-changelog-data-earlier-77.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_79 } from "./client-changelog-data-earlier-79.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_84 } from "./client-changelog-data-earlier-84.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_85 } from "./client-changelog-data-earlier-85.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_87 } from "./client-changelog-data-earlier-87.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_88 } from "./client-changelog-data-earlier-88.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_89 } from "./client-changelog-data-earlier-89.js";
import { CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER } from "./client-changelog-parallel-muster.js";
import { CLIENT_CHANGELOG_ENTRIES_SELF_PROFILE_CHIP } from "./client-changelog-self-profile-chip.js";
import { CLIENT_CHANGELOG_ENTRIES_FARMLAND } from "./client-changelog-farmland.js";
import { CLIENT_CHANGELOG_ENTRIES_TERRAIN } from "./client-changelog-data-terrain.js";
import { CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD } from "./client-changelog-activity-dashboard.js";
import { CLIENT_CHANGELOG_ENTRIES_RECENT } from "./client-changelog-data-recent.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const RECENT_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  { createdAt: 1789933799385, introducedIn: "2026.09.25.2", title: "Login shows a download progress bar instead of freezing", why: "The last login step, \"Packaging your session for delivery\", could sit unchanged for ten seconds or more on phones while your world downloaded and loaded, with the elapsed-seconds counter stuck.", changes: ["While your world downloads, the login screen shows a progress bar with how much has arrived and about how long is left", "Once the download finishes the bar fills and it says \"Building your map...\" with an estimate of the remaining wait, instead of looking stuck", "The time estimate learns how fast your device builds the map, so it gets more accurate after your first login"] },
  { createdAt: 1789933799383, introducedIn: "2026.09.25.1", title: "Way stations now activate when your town's reach grows over them", why: "Settling a town extends your border over nearby neutral land for free, but that path skipped way station activation, so a way station inside the new reach became yours as frontier with no reward and no popup.", changes: ["A dormant way station (or watchtower) inside a newly claimed reach area now activates immediately and shows its reward popup"] },
  {
    createdAt: 1789926100463, // frozen, 1ms after "Siphon now steals resource slots..." (the bundle keeps a 6-day window relative to the newest entry, so it must not jump ahead of the frozen clock)
    introducedIn: "2026.09.24.2",
    title: "Tapping a waystation now shows its status in the tile overview",
    why: "Selecting a waystation showed nothing waystation-specific, so you couldn't tell whether it was still up for capture or what it had granted.",
    changes: [
      "The tile overview shows whether a waystation is Dormant (capturable) or Active",
      "Active waystations list the permanent effect they granted and who activated them"
    ]
  },
  {
    createdAt: 1789926100462, // frozen (Date.now() at write time would shift the "latest week" window), 1ms after "A disabled Relay Beacon's heliograph mirrors..."
    introducedIn: "2026.09.23.1",
    title: "Siphon now steals resource slots and lasts until you cancel it",
    why: "Siphon used to zero an enemy's town and resource output for 60 minutes, but nothing actually reached the caster even though the tooltip said it siphoned at 100% -- and it never touched the resource slots your structures run on.",
    changes: [
      "Casting Siphon locks one of your Aether Towers into siphon mode. While it lasts, every siphoned enemy resource tile's slots count for you instead of its owner -- their structures may go dormant, and yours may wake up. Siphoned towns still produce nothing",
      "No more 60-minute timer: the siphon lasts until you pick the tower and choose Cancel siphon, the owner switches on an Aether Tower whose protection covers the siphoned tiles, your tower is lost or switched off, or a siphoned tile changes hands",
      "A tower in siphon mode can't cast other abilities; its 10-minute cooldown starts when the siphon ends",
      "Tiles already covered by their owner's own Aether Tower can't be siphoned",
      "Towers in siphon mode show a crimson drain badge on the 3D map and a crimson ring with a teal spiral on the 2D map"
    ]
  },
  {
    createdAt: 1789926100461, // frozen, 1ms after "AI empires stuck at the edge of their reach can build Relay Beacons into unexplored land again"
    introducedIn: "2026.09.22.5",
    title: "A disabled Relay Beacon's heliograph mirrors no longer keep spinning in the 3D map",
    why: "The 3D Relay Beacon model's mirror array and drive gears animated continuously regardless of the beacon's status, so a disabled (out-of-FOOD-slot) beacon looked identical to an active one at a glance -- there was no visual cue that it had stopped working.",
    changes: [
      "A Relay Beacon's mirror array now freezes in place on the 3D map while the beacon is disabled, and resumes spinning once it's active again"
    ]
  },
  {
    createdAt: 1789926100460, // frozen, 1ms after "Capturing an already-owned tile now activates a dormant watchtower or way station on it..." -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.22.4",
    title: "AI empires stuck at the edge of their reach can build Relay Beacons into unexplored land again",
    why: "The AI planner ran on a worker thread that used the wrong world map to decide whether unexplored tiles could be land, so it never credited unexplored land to a Relay Beacon site. An AI whose nearby resources were all claimed had no valid site and sat idle every turn, even with plenty of manpower and food slots.",
    changes: [
      "AI empires now treat tiles they haven't explored as possible land when choosing a Relay Beacon site, so they can push past the edge of their reach",
      "Unexplored tiles that sit behind two or more visible ocean tiles are treated as open sea and no longer draw beacons along a beach"
    ]
  },
  {
    createdAt: 1789926100459, // frozen, 1ms after "A captured way station's minimap dot now updates immediately..."
    introducedIn: "2026.09.22.3",
    title: "Capturing an already-owned tile now activates a dormant watchtower or way station on it, same as claiming neutral land",
    why: "A watchtower or way station is placed during world generation regardless of who currently owns the land underneath it, so a dormant one could sit on a tile owned by another player or by the roaming Bleed faction. Winning an attack on that tile transferred ownership, but the code that flips the structure to activated (and fires its popup, activity-feed entry, and granted bonus) only ran when the tile was claimed off of neutral land, never when it was captured from another owner -- so the ability sat inert, with no popup and no activity-feed entry, until the tile's new owner abandoned it and reclaimed it as neutral land to force it through the working path.",
    changes: [
      "Winning an attack that captures a tile carrying a dormant watchtower or way station now activates it immediately, granting its bonus and showing its popup and activity-feed entry, instead of leaving it permanently inert until the tile was abandoned and re-claimed"
    ]
  },
  {
    createdAt: 1789926100458, // frozen, 1ms after "A captured way station's lens no longer keeps shining on the true-3D map"
    introducedIn: "2026.09.22.2",
    title: "A captured way station's minimap dot now updates immediately instead of waiting for an unrelated tile change",
    why: "The minimap's expensive content layer (owner tints, fog, docks, town/watchtower/way station markers) is cached and only recomputed when the tile-related state it depends on actually changes -- but that dirty check only compared the total tile count and the replay index. Capturing a way station mutates its `activated` flag on an existing tile without adding or removing one, so the check never noticed, and the way station kept showing its bright pre-capture dot on the minimap until some unrelated tile happened to appear or disappear (or a page reload rebuilt the cache from scratch) -- it was never actually stuck, just stale until the next unrelated recompute.",
    changes: [
      "Minimap: capturing a way station (or any other in-place tile change the map already tracks visually, like a watchtower activating) now redraws its minimap dot in the same frame the game state updates, instead of leaving the previous dot color in place until an unrelated tile add/remove happened to force a recompute"
    ]
  },
  {
    createdAt: 1789926100457, // frozen, 1ms after "Way station map reveals no longer point you at ground you can already see"
    introducedIn: "2026.09.22.1",
    title: "A captured way station's lens no longer keeps shining on the true-3D map",
    why: "The true-3D way station overlay drew every way station's glowing lens through one shared material, whose brightness was picked once per frame from the aggregate activation state of ALL way stations on the map (bright-pulsing if any were still dormant, dim only once every last one had been captured). So capturing your own way station didn't actually dim its lens as long as any other way station anywhere on the map -- yours or an opponent's -- was still uncaptured, which is effectively always. The 2D canvas renderer already computed the glow per tile and was unaffected.",
    changes: [
      "True-3D renderer: a captured way station's lens now dims immediately and stays dim, independent of whether other way stations elsewhere on the map are still dormant"
    ]
  },
  {
    createdAt: 1789926100456, // frozen, 1ms after "Farmstead can no longer be built on FISH tiles..."
    introducedIn: "2026.09.21.3",
    title: "Way station map reveals no longer point you at ground you can already see",
    why: "The map-reveal reward always centered on the nearest town within range, regardless of whether you already had vision of it -- a way station near your own capital, or an enemy town already lit up by an ally or a Relay Beacon, could burn a way station's entire VISION roll on ground you were already looking at.",
    changes: [
      "The map-reveal reward now skips over a nearby town you already have vision of and centers on the next-nearest one you don't -- still falling back to the way station's own tile if every town in range is already visible or none is nearby"
    ]
  },
  {
    createdAt: 1789926100455, // frozen, 1ms after "Way stations now stop animating once their bonus is collected"
    introducedIn: "2026.09.21.2",
    title: "Farmstead can no longer be built on FISH tiles, and now shows up on the Actions tab while it's actually buildable",
    why: "Farmstead has never had any effect on fish production or a FISH tile's FOOD slot count (§5.3: FISH gets its own flat, tech-gated slot bonus instead, independent of any structure) -- but the build was still offered on FISH tiles, so a player could spend gold and manpower on a Farmstead there that does literally nothing. Separately, Farmstead is a build_* action, so on FARM tiles (where it matters) it only ever showed on the Buildings tab, a tab away from the default Actions tab you land on when tapping a settled tile, and it's the single most commonly reached-for building there once Agrarian Works is researched -- making a player go find it every time was needless friction.",
    changes: [
      "Build Farmstead is no longer offered on FISH tiles, since it never did anything there",
      "Build Farmstead now appears as a quick action on the Actions tab of a FARM tile's menu whenever it's researched, not yet built there, and has a free slot -- it still also appears on the Buildings tab, same as before, for players used to browsing there"
    ]
  },
  {
    createdAt: 1789926100454, // frozen, 1ms after the "AI empires no longer permanently strand a Relay Beacon..." entry
    introducedIn: "2026.09.21.1",
    title: "Way stations now stop animating once their bonus is collected",
    why: "The lens glow already dimmed once a way station's bonus was activated, but its weathercock vane kept spinning forever afterward in both the 2D and 3D renderers, making an already-collected way station look like it still had something to offer.",
    changes: [
      "A way station's weathercock vane now freezes in place once its bonus has been collected, in both the 2D canvas and true-3D map renderers"
    ]
  },
  {
    createdAt: 1789926100454, // frozen, newer than every existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.21.1",
    title: "Gold storage cap now covers 48 hours of income instead of 24",
    why: "Your gold stockpile cap scales with your current income rate, but tech prices climb on a fixed schedule as you research more of them, independent of income. With only a 24-hour cap, a slower-growing economy could see its cap sit below the next tech's price -- and gold earned above the cap is discarded, not banked, so there was no way to save up for it faster than income itself grew.",
    changes: [
      "Gold storage cap raised from 24 hours of current income to 48 hours, giving more headroom to save toward the next tech purchase before overflow starts discarding income",
      "Food storage cap (which uses the same window) is raised from 24 to 48 hours as well, since both caps share the same underlying formula"
    ]
  },
  {
    createdAt: 1789926100453, // frozen, 1ms after "Frontier tiles outside your reach now hold on for 5 minutes..."
    introducedIn: "2026.09.20.6",
    title: "AI empires no longer permanently strand a Relay Beacon over a small FOOD shortage",
    why: "When an AI ran short on FOOD slots, it could disable its only (or one of very few) Relay Beacons to try to free a slot — but an AI's first 5 Relay Beacons cost no FOOD slot at all, so disabling one there gained nothing and just permanently lost that beacon's reach, since nothing ever turned it back on.",
    changes: [
      "An AI with 5 or fewer Relay Beacons now abandons the least valuable one's territory instead of disabling it, when disabling wouldn't have freed any FOOD slot anyway",
      "An AI now re-enables a previously disabled Relay Beacon on its own once FOOD has headroom again, instead of leaving it off forever"
    ]
  },
  {
    createdAt: 1789926100452, // frozen, 1ms after the "Added a Score Graph..." entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.20.5",
    title: "Frontier tiles outside your reach now hold on for 5 minutes before decaying, and losing one can now cut off nearby frontier of yours",
    why: "The out-of-reach decay timer for a claimed-but-unreached frontier tile was 2 minutes, which felt punishingly short. Separately, when such a tile expired it cleared without checking whether any of your OTHER frontier tiles depended on it as their only path back to a settled town or dock -- unlike every other way a tile can lose ownership (combat, abandonment, economic-structure loss), which already re-check that. A tile could sit permanently cut off and never show the same visual state combat-caused encirclement gets, until some unrelated action happened to touch that area.",
    changes: [
      "A frontier tile claimed or captured outside your reach now takes 5 minutes to decay, up from 2",
      "When an out-of-reach tile decays, any of your other frontier tiles that were only connected through it are now cut off in the same moment, instead of silently lingering until something else re-checks that territory"
    ]
  },
  {
    createdAt: 1789926100451, // frozen, newer than every existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.2",
    title: "Added a Score Graph to the season-ended screen",
    why: "The season-ended screen could only ever show each player's final score, with no sense of how the standings got there -- whether the winner led wire-to-wire or overtook everyone late, or how close a comeback attempt came.",
    changes: [
      "Season-ended screen now has a \"Score Graph\" tab plotting every player's score over the course of the season as a line chart, with a legend and your own line highlighted",
      "The graph is built from a new lightweight score sampler on the server that snapshots every player's score every 8 hours (roughly 90 samples over a full 30-day season) -- it only appears once a season has enough samples to draw a line"
    ]
  },
  {
    createdAt: 1789926100449, // frozen, 1ms after the "Town terrain now reads as part of the town sheet" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.20.4",
    title: "Removed mountains now stay removed after a server restart",
    why: "Mountain removal only updated the live in-memory tile; the checkpoint snapshot's compaction step treated terrain as static worldgen output and never recorded the change, so a restart regenerated the world from its original seed and the mountain came back.",
    changes: [
      "Terrain changes (including mountain removal) are now saved as part of the checkpoint overlay, so they survive a server restart"
    ]
  },
  {
    createdAt: 1789839014183, // frozen, 1ms after the prior newest entry
    introducedIn: "2026.09.19.2",
    title: "Airport bombardment now reliably clears mustering flags",
    why: "Bombing a tile cleared its ownership through the normal tile update every client receives, but the mustering flag on that tile was only ever cleared through a separate best-effort broadcast that could be missed — leaving a stuck muster flag visible on a tile that had already lost its owner, with no way to clear it.",
    changes: [
      "Bombarding a tile with a staged muster flag now clears that flag through the same reliable update that clears ownership, instead of a separate message that could be dropped"
    ]
  },
  {
    createdAt: 1789926100450, // frozen, 1ms after "Removed mountains now stay removed after a server restart"
    introducedIn: "2026.09.20.5",
    title: "Aether walls and bridges no longer double-render in 3D",
    why: "The flat 2D lane/edge drawn for aether walls and bridges only had its secondary anchor/pylon glyphs skipped in the true-3D renderer, not the lane itself, so it kept painting a duplicate flat effect over the 3D renderer's own native pylons and could look like it never cleared when the effect ended.",
    changes: [
      "Aether wall and aether bridge visuals now render only through the true-3D renderer's native pylons when 3D mode is active, removing the leftover flat 2D overlay"
    ]
  },
  {
    createdAt: 1789852188214, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.19.01",
    title: "Mintworks descriptions now show all gold bonuses",
    why: "The Mintworks description highlighted the town production multiplier but omitted its flat base-income bonus and one-time completion reward.",
    changes: ["Mintworks descriptions now show +1 base gold income, +10% town gold production per copy, and +10 instant gold on completion"]
  },
  {
    createdAt: 1789848292584, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.19.1",
    title: "AI actions now recover from unreachable beacons and full FOOD slots",
    why: "AI action planning now checks relay-beacon settlement reach before issuing SETTLE and remembers rejected action targets until the relevant world state changes, so live empires no longer loop on commands the runtime will reject.",
    changes: [
      "Relay-beacon settlement uses the same reach and town/dock exemption as the runtime",
      "A rejected FOOD-capacity build now prefers reversible FOOD-slot relief and explains when no safe relief exists"
    ]
  },
  {
    createdAt: 1789807901404, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.19.1",
    title: "Added an Email Notifications settings page",
    why: "Every gameplay email alert (alliance requests, alliance breaks, truce offers, attacks, Aether Purges, new season) used to fire unconditionally for any account with a bound email, with no way to turn individual categories off.",
    changes: [
      "New \"Email Notifications\" settings page lets you opt out of each gameplay email category individually",
      "Every category defaults to on, matching the previous always-on behavior, until you turn one off"
    ]
  },
  {
    createdAt: 1789766918101, // frozen, 1ms after "Duke title for planet-holding empires" (the previous newest)
    introducedIn: "2026.09.18.10",
    title: "Fixed the Observatory dossier showing the wrong name and manpower cap",
    why: "Revealing a rival empire with an Observatory showed their raw account ID instead of their display name, and showed their manpower cap as equal to their current manpower (so it always read as \"full\"). The simulation server doesn't know player display names -- those only exist in the gateway's profile store -- so it was falling back to the raw ID, and the dossier builder was echoing current manpower back as the cap instead of reading the real cap.",
    changes: [
      "The Observatory dossier now shows the revealed empire's real display name, resolved the same way the map and leaderboard already do",
      "The Observatory dossier's manpower stat now shows the empire's real manpower cap instead of repeating their current manpower"
    ]
  },
  {
    createdAt: 1789766918100, // frozen, 1ms after "AI empires can push relay beacons into fresh fog again" (the previous newest)
    introducedIn: "2026.09.18.9",
    title: "Duke title for planet-holding empires",
    why: "Owning a galaxy Planet is a persistent, cross-season honor that wasn't shown anywhere outside the profile's Galactic Holdings list.",
    changes: [
      "A player who currently owns a galaxy Planet is now shown as \"Duke\": a royal-purple name tint + crown badge, applied everywhere names render (leaderboard, tile-owner labels, lobby roster) and in the player profile"
    ]
  },
  {
    createdAt: 1789766918098, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.18.8",
    title: "AI empires can push relay beacons into fresh fog again",
    why: "A mature AI empire could have free FOOD slots and plenty of frontier land, but still stop growing once every visible nearby prize was already claimed. The relay-beacon planner rejected some otherwise useful launch sites just because the beacon tile itself was already inside current reach, even when building there would reveal unexplored land beyond the visible border.",
    changes: [
      "AI relay beacons can now use already-held reach as a launch point when the site opens genuinely unexplored land",
      "The anti-overlap guard still blocks redundant beacons that only reach already-known plain scraps"
    ]
  },
  {
    createdAt: 1789763248832, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.18.7",
    title: "Fixed: Deadliest Tile and Longest Road missing from the end-of-season Misc tab for a season that clearly had both",
    why: "Both stats were computed correctly and broadcast live during the game -- the live season summary always had the real data. But the function that builds the permanent archived record for a finished season (used once the next season starts and you're looking back at the last one) copied over the winner, galaxy tiers, and a few other fields one by one and simply never referenced seasonStats, so mostDeadlyTile/longestRoad were silently dropped from every archived season, every time, regardless of how much fighting happened.",
    changes: [
      "A finished season's archived record now keeps its Deadliest Tile and Longest Road stats, so the Misc tab shows up correctly when reviewing a past season instead of only during the live post-victory window"
    ]
  },
  {
    createdAt: 1789749968740, // frozen, newer than every existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.18.6",
    title: "More land, more detailed coastlines on Continents maps",
    why: "The tectonic-plate continent generator (introduced this same branch) still read as too much open water, and its coastlines were smooth almost everywhere -- nearly all of the coastline-noise weight sat on continent-scale octaves (a third to half the map wide), leaving barely any weight on the tile-scale detail that makes a coastline look like it has real bays and inlets instead of one long curve.",
    changes: [
      "Continents-style maps now target ~45% land instead of ~37%",
      "Coastlines carry visible detail down to single-tile notches everywhere, not just in occasional fjord/archipelago zones"
    ]
  },
  {
    createdAt: 1789731957252, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.18.5",
    title: "A welcome letter for new Dukes",
    why: "Winning your first Sector campaign dropped you straight into Space View with no ceremony -- your new Planet had no name and no acknowledgment of what you'd just done.",
    changes: [
      "First visit to Space View with an unnamed Planet now asks you to name it",
      "Naming your Planet is followed by a decree letter from the Imperial Court welcoming you as Duke of it"
    ]
  },
  {
    createdAt: 1789656367100, // frozen, 1ms after the "New seasons now require a player vote to start" entry (the previous newest)
    introducedIn: "2026.09.18.4",
    title: "Waystations now glow while unclaimed and notify you if one activates while you're away",
    why: "A waystation's lens used to glow bright once activated and sit dim while dormant -- backwards from what players expect (a dim beacon reads as \"already dealt with\", not \"come claim me\"). Separately, activation can trigger passively (auto-settling onto a dormant waystation tile), and the popup explaining what it granted only ever fired for players connected at that exact moment -- anyone who logged back in afterward, on any device, just found an already-activated waystation with no explanation of what they got.",
    changes: [
      "Waystation lenses now glow bright while dormant (in both the 2D and 3D renderers, plus the minimap) and settle to a dim glow once activated",
      "Logging in or reconnecting now shows the activation popup for any of your waystations that activated while you were away, the same popup you'd see live -- and it now follows your account across devices instead of only the browser that was open at the time"
    ]
  },
  {
    createdAt: 1789656367099, // frozen, 1ms after the "Next season's map will be continents" entry (the previous newest)
    introducedIn: "2026.09.18.3",
    title: "New seasons now require a player vote to start",
    why: "A season could auto-start on its own an hour after the previous one ended, even if players hadn't voted -- skipping past the old season's scoreboard before anyone chose to move on.",
    changes: [
      "Removed the automatic season-start timer -- a new season now only begins once players vote for it",
      "Lowered the votes needed to start a new season from 5 to 2"
    ]
  },
  {
    createdAt: 1789656367098, // frozen, 1ms after the "Aether Wall blocks now say so" entry (the previous newest)
    introducedIn: "2026.09.18.2",
    title: "Next season's map will be continents",
    why: "Production's first season was seeded as island-heavy. The next season rollover switches the map style to continents.",
    changes: [
      "The next season, once started, will generate a continents-style map instead of islands"
    ]
  },
  {
    createdAt: 1789656367097, // frozen, 1ms after the "Fixed the CRYSTAL economy panel undercounting Aether Towers" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.18.1",
    title: "Aether Wall blocks now say so",
    why: "Trying to expand across a border sealed by an Aether Wall showed the same generic message used for spawn-protection blocks (\"that empire is still under spawn protection\"), which was misleading when no spawn shield was involved.",
    changes: [
      "Attacking or expanding across a crossing sealed by an Aether Wall now reports \"that border is sealed by an Aether Wall\" instead of the spawn-protection message"
    ]
  },
  {
    createdAt: 1789656367096, // frozen, 1ms after the "Removed the \"Waypoint halted\" activity feed message" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.10",
    title: "Fixed the CRYSTAL economy panel undercounting Aether Towers",
    why: "The \"Occupied by\" breakdown under the CRYSTAL resource panel only read a tile's fort, siege outpost, and economic-structure fields when tallying who was using a slot. Aether Towers (Observatories) are tracked as their own separate tile field, so every Aether Tower's CRYSTAL slot was invisible to this breakdown -- the panel could show a used/total ratio like 69/55 while the visible per-building list only summed to 14.",
    changes: [
      "The CRYSTAL \"Occupied by\" list now includes Aether Towers, so the visible breakdown adds up to the total slots used"
    ]
  },
  {
    createdAt: 1789656367095, // frozen, 1ms after the "Clickable player names now show an underline" entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.9",
    title: "Removed the \"Waypoint halted\" activity feed message",
    why: "A stalled waypoint already turns its flag into a cancel-me state (NO_PATH), so the extra feed line just duplicated that signal and cluttered the feed with information players didn't need.",
    changes: [
      "A halted waypoint no longer posts a message to the activity feed",
      "The waypoint flag itself still shows the halted/cancellable state"
    ]
  },
  {
    createdAt: 1789656367093, // frozen, one past the previous newest entry
    introducedIn: "2026.09.17.8",
    title: "Clickable player names now show an underline",
    why: "Player names that open a profile card (in tile descriptions, the leaderboard, etc.) looked like plain text, so the fact they were clickable wasn't discoverable.",
    changes: [
      "Clickable player names now show a dotted underline to make it clear you can click them to open the player's profile card"
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
    createdAt: 1789926100453, // frozen, 1ms after the "Frontier tiles outside your reach..." entry (the previous newest at the time this was written)
    introducedIn: "2026.09.21.1",
    title: "New Activity dashboard shows your real combat and territory history from the last 24 hours",
    why: "The old Activity Feed only ever showed whatever happened while you had the client open, plus a lossy backfill of a handful of recent notices -- it couldn't tell you what actually happened to your empire while you were away: how much territory you gained or lost, how much gold was plundered from you or that you plundered, or how much manpower you spent attacking. The new Yours dashboard is sourced from the same durable 24h logs the server itself uses, so it's accurate even after a long time away.",
    changes: [
      "New Activity button in the HUD (next to Alerts) opens the Yours dashboard: a summary line of tiles claimed/lost, gold plundered/raided, and other counts, followed by a chronological timeline of your combat and territory events with a Center button to jump the map to each one",
      "Opens automatically, once per session, when you return to a game with new activity since you last checked",
      "If you were away more than 24 hours, the dashboard says so explicitly instead of implying the timeline covers your whole time away",
      "The existing Alerts panel (formerly \"Activity Feed\") is unchanged -- it still backfills your last 24 hours of history on login, since the new dashboard only covers combat and territory so far"
    ]
  },
  {
    createdAt: 1789933799382, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.24.1",
    title: "Space View: press your planet to build, defend it from Wardens, and work against the Court",
    why: "Space View was a map with no clear reason to open it. Dukes now have planets to develop, ships to send, something hunting them at the start, and a shared goal: the fall of the Court.",
    changes: [
      "Press one of your planets to open its panel: its Stability, its ships, and everything it can build. Each planet has its own build slot, so a Duke with two planets builds two things at once",
      "Ships are how you give orders: press a Fighter to send it raiding a system you have surveyed, or a Probe to survey one. Probes are used up, then stay in orbit and keep you updated on that system (up to 3 at once)",
      "Every planet has 2 to 4 bodies in orbit, coloured by kind. Build a Gas Harvester on a gas giant or a Mining Station on an asteroid belt for more Production, or a Cryo Refinery on an ice moon to heal that planet. The first development in each system is free; each extra one costs 1 Influence a Cycle",
      "Wardens are hardest at the start: a fixed number of attacks a Cycle is shared between every planet in the galaxy, so a lone planet takes them all and each new planet eases everyone's share. A Fighter stationed at a planet repels an attack for 20 hull damage; with none, that planet loses a flat 20 Stability and takes five hits to be contested. Each attack is announced first",
      "New Dukes get a one-time offer from the Court: 30 days of protection from Wardens in return for 90 days without Move Against the Court",
      "A list at the top of Space View says what needs you right now, and three meters under it show your Stability, your Domain Weight (your score for the throne) and Court Strength (the shared countdown to the Court falling). Hover any of them for a plain explanation",
      "The Court tab holds Move Against the Court: wager Influence to weaken the Court and raise your Domain Weight, once per Cycle. A Log tab lists what happened while you were away",
      "A raid that gets through now always costs a flat 20 Stability, whatever size the fleet. The Contest vote is gone from the Senate: a Sector is contested when its Stability reaches 0",
      "Influence income and upkeep were rebalanced so a single planet no longer runs at a loss, and Stability heals whenever your Influence is zero or above. Production is now a daily rate per planet instead of a weekly wallet",
      "The Manage Planet button is gone from Space View, since you now press your planet to manage it. Planet naming still happens in the welcome letter",
      "Every Space View panel (Duke, Senate, Settings) now has a close button and also closes when you press outside it or hit Escape. On phones the panels slide up as a bottom sheet so the map stays visible, the top bar scrolls sideways instead of wrapping, and the attention list shrinks to fit"
    ]
  },
  { createdAt: 1789766351673, introducedIn: "2026.09.18.7", title: "Waystation captures now keep their reward", why: "Expanding onto a Waystation briefly activated it on the server, but the capture-complete tile update could then resend the older inactive tile shape, hiding the reward popup and making the site look like it did nothing.", changes: ["Frontier expansion over a Waystation now sends the activated Waystation result in the final capture update, so the reward and popup persist correctly"] },
  {
    createdAt: 1789926100455, // frozen, 1ms after the "Way stations now stop animating..." entry
    introducedIn: "2026.09.21.2",
    title: "Gold is now called Coin",
    why: "\"Gold\" never fit a game with no gold resource tiles or gold-colored anything -- it was just the name of the currency you earn from towns and docks. Renamed the display text to Coin throughout the game; nothing about how it's earned or spent changed.",
    changes: [
      "Every player-facing mention of Gold (HUD, build costs, tech costs, tooltips, discovery tips, alerts, and activity feed) now says Coin instead",
      "No gameplay change: amounts, costs, and income formulas are exactly the same as before"
    ]
  },
  {
    createdAt: 1789926100456, // frozen, 1ms after the "Gold is now called Coin" entry
    introducedIn: "2026.09.22.1",
    title: "Eight buildings renamed",
    why: "Continuing the same renaming pass as the Gold-to-Coin change: eight more buildings had names left over from earlier working titles that no longer matched the game's steampunk-fantasy setting.",
    changes: [
      "Farmstead is now Hydrogarden",
      "Waterworks is now Hydroworks",
      "Aetherport is now Sky Dock",
      "Advanced Umbrite Works is now High-Yield Umbrite Works",
      "Advanced Titanium Works is now High-Yield Titanium Works",
      "Advanced Aether Condenser is now High-Yield Aether Condenser",
      "Population Bureau is now Census Directorate",
      "Worldbreaker Cannon is now Sovereign Siege Engine",
      "No gameplay change: this is a display-text rename only, costs and effects are unchanged"
    ]
  },
  {
    createdAt: 1789926100457, // frozen, 1ms after the "Eight buildings renamed" entry
    introducedIn: "2026.09.22.2",
    title: "Seed Granary removed",
    why: "Seed Granary was a rarely-built Granary upgrade whose only effect -- a population-growth buff to nearby Granaries on the same island -- overlapped confusingly with the plain Granary's own growth bonus. It's been retired to simplify the manpower building line.",
    changes: [
      "Seed Granary can no longer be built or upgraded to",
      "Any Seed Granary from before this update automatically reverts to a plain Granary (Incubation Engine) the next time the server restarts -- no action needed, and its town keeps producing population growth as a Granary"
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD,
  ...CLIENT_CHANGELOG_ENTRIES_RECENT,
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_TERRAIN,
  ...CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER,
  ...CLIENT_CHANGELOG_ENTRIES_SELF_PROFILE_CHIP,
  ...CLIENT_CHANGELOG_ENTRIES_FARMLAND,
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_52,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_55,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_56,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_58,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_61,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_62,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_67,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_68,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_69,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_77,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_79,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_84,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_85,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_87,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_88,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_89
];
