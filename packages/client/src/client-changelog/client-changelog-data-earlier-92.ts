import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_92: ClientChangelogEntry[] = [
  {
    createdAt: 1789656367095,
    introducedIn: "2026.09.17.9",
    title: "Removed the \"Waypoint halted\" activity feed message",
    why: "A stalled waypoint already turns its flag into a cancel-me state (NO_PATH), so the extra feed line just duplicated that signal and cluttered the feed with information players didn't need.",
    changes: [
      "A halted waypoint no longer posts a message to the activity feed",
      "The waypoint flag itself still shows the halted/cancellable state"
    ]
  },
  {
    createdAt: 1789656367096,
    introducedIn: "2026.09.17.10",
    title: "Fixed the CRYSTAL economy panel undercounting Aether Towers",
    why: "The \"Occupied by\" breakdown under the CRYSTAL resource panel only read a tile's fort, siege outpost, and economic-structure fields when tallying who was using a slot. Aether Towers (Observatories) are tracked as their own separate tile field, so every Aether Tower's CRYSTAL slot was invisible to this breakdown -- the panel could show a used/total ratio like 69/55 while the visible per-building list only summed to 14.",
    changes: [
      "The CRYSTAL \"Occupied by\" list now includes Aether Towers, so the visible breakdown adds up to the total slots used"
    ]
  },
  {
    createdAt: 1789656367097,
    introducedIn: "2026.09.18.1",
    title: "Aether Wall blocks now say so",
    why: "Trying to expand across a border sealed by an Aether Wall showed the same generic message used for spawn-protection blocks (\"that empire is still under spawn protection\"), which was misleading when no spawn shield was involved.",
    changes: [
      "Attacking or expanding across a crossing sealed by an Aether Wall now reports \"that border is sealed by an Aether Wall\" instead of the spawn-protection message"
    ]
  },
  {
    createdAt: 1789656367098,
    introducedIn: "2026.09.18.2",
    title: "Next season's map will be continents",
    why: "Production's first season was seeded as island-heavy. The next season rollover switches the map style to continents.",
    changes: [
      "The next season, once started, will generate a continents-style map instead of islands"
    ]
  },
  {
    createdAt: 1789656367099,
    introducedIn: "2026.09.18.3",
    title: "New seasons now require a player vote to start",
    why: "A season could auto-start on its own an hour after the previous one ended, even if players hadn't voted -- skipping past the old season's scoreboard before anyone chose to move on.",
    changes: [
      "Removed the automatic season-start timer -- a new season now only begins once players vote for it",
      "Lowered the votes needed to start a new season from 5 to 2"
    ]
  },
  {
    createdAt: 1789656367100,
    introducedIn: "2026.09.18.4",
    title: "Waystations now glow while unclaimed and notify you if one activates while you're away",
    why: "A waystation's lens used to glow bright once activated and sit dim while dormant -- backwards from what players expect (a dim beacon reads as \"already dealt with\", not \"come claim me\"). Separately, activation can trigger passively (auto-settling onto a dormant waystation tile), and the popup explaining what it granted only ever fired for players connected at that exact moment -- anyone who logged back in afterward, on any device, just found an already-activated waystation with no explanation of what they got.",
    changes: [
      "Waystation lenses now glow bright while dormant (in both the 2D and 3D renderers, plus the minimap) and settle to a dim glow once activated",
      "Logging in or reconnecting now shows the activation popup for any of your waystations that activated while you were away, the same popup you'd see live -- and it now follows your account across devices instead of only the browser that was open at the time"
    ]
  },
  {
    createdAt: 1789731957252,
    introducedIn: "2026.09.18.5",
    title: "A welcome letter for new Dukes",
    why: "Winning your first Sector campaign dropped you straight into Space View with no ceremony -- your new Planet had no name and no acknowledgment of what you'd just done.",
    changes: [
      "First visit to Space View with an unnamed Planet now asks you to name it",
      "Naming your Planet is followed by a decree letter from the Imperial Court welcoming you as Duke of it"
    ]
  },
  {
    createdAt: 1789749968740,
    introducedIn: "2026.09.18.6",
    title: "More land, more detailed coastlines on Continents maps",
    why: "The tectonic-plate continent generator (introduced this same branch) still read as too much open water, and its coastlines were smooth almost everywhere -- nearly all of the coastline-noise weight sat on continent-scale octaves (a third to half the map wide), leaving barely any weight on the tile-scale detail that makes a coastline look like it has real bays and inlets instead of one long curve.",
    changes: [
      "Continents-style maps now target ~45% land instead of ~37%",
      "Coastlines carry visible detail down to single-tile notches everywhere, not just in occasional fjord/archipelago zones"
    ]
  },
  {
    createdAt: 1789763248832,
    introducedIn: "2026.09.18.7",
    title: "Fixed: Deadliest Tile and Longest Road missing from the end-of-season Misc tab for a season that clearly had both",
    why: "Both stats were computed correctly and broadcast live during the game -- the live season summary always had the real data. But the function that builds the permanent archived record for a finished season (used once the next season starts and you're looking back at the last one) copied over the winner, galaxy tiers, and a few other fields one by one and simply never referenced seasonStats, so mostDeadlyTile/longestRoad were silently dropped from every archived season, every time, regardless of how much fighting happened.",
    changes: [
      "A finished season's archived record now keeps its Deadliest Tile and Longest Road stats, so the Misc tab shows up correctly when reviewing a past season instead of only during the live post-victory window"
    ]
  },
  {
    createdAt: 1789766351673,
    introducedIn: "2026.09.18.7",
    title: "Waystation captures now keep their reward",
    why: "Expanding onto a Waystation briefly activated it on the server, but the capture-complete tile update could then resend the older inactive tile shape, hiding the reward popup and making the site look like it did nothing.",
    changes: [
      "Frontier expansion over a Waystation now sends the activated Waystation result in the final capture update, so the reward and popup persist correctly"
    ]
  },
  {
    createdAt: 1789766918098,
    introducedIn: "2026.09.18.8",
    title: "AI empires can push relay beacons into fresh fog again",
    why: "A mature AI empire could have free FOOD slots and plenty of frontier land, but still stop growing once every visible nearby prize was already claimed. The relay-beacon planner rejected some otherwise useful launch sites just because the beacon tile itself was already inside current reach, even when building there would reveal unexplored land beyond the visible border.",
    changes: [
      "AI relay beacons can now use already-held reach as a launch point when the site opens genuinely unexplored land",
      "The anti-overlap guard still blocks redundant beacons that only reach already-known plain scraps"
    ]
  },
  {
    createdAt: 1789766918100,
    introducedIn: "2026.09.18.9",
    title: "Duke title for planet-holding empires",
    why: "Owning a galaxy Planet is a persistent, cross-season honor that wasn't shown anywhere outside the profile's Galactic Holdings list.",
    changes: [
      "A player who currently owns a galaxy Planet is now shown as \"Duke\": a royal-purple name tint + crown badge, applied everywhere names render (leaderboard, tile-owner labels, lobby roster) and in the player profile"
    ]
  },
  {
    createdAt: 1789766918101,
    introducedIn: "2026.09.18.10",
    title: "Fixed the Observatory dossier showing the wrong name and manpower cap",
    why: "Revealing a rival empire with an Observatory showed their raw account ID instead of their display name, and showed their manpower cap as equal to their current manpower (so it always read as \"full\"). The simulation server doesn't know player display names -- those only exist in the gateway's profile store -- so it was falling back to the raw ID, and the dossier builder was echoing current manpower back as the cap instead of reading the real cap.",
    changes: [
      "The Observatory dossier now shows the revealed empire's real display name, resolved the same way the map and leaderboard already do",
      "The Observatory dossier's manpower stat now shows the empire's real manpower cap instead of repeating their current manpower"
    ]
  },
  {
    createdAt: 1789807901404,
    introducedIn: "2026.09.19.1",
    title: "Added an Email Notifications settings page",
    why: "Every gameplay email alert (alliance requests, alliance breaks, truce offers, attacks, Aether Purges, new season) used to fire unconditionally for any account with a bound email, with no way to turn individual categories off.",
    changes: [
      "New \"Email Notifications\" settings page lets you opt out of each gameplay email category individually",
      "Every category defaults to on, matching the previous always-on behavior, until you turn one off"
    ]
  },
  {
    createdAt: 1789839014183,
    introducedIn: "2026.09.19.2",
    title: "Airport bombardment now reliably clears mustering flags",
    why: "Bombing a tile cleared its ownership through the normal tile update every client receives, but the mustering flag on that tile was only ever cleared through a separate best-effort broadcast that could be missed — leaving a stuck muster flag visible on a tile that had already lost its owner, with no way to clear it.",
    changes: [
      "Bombarding a tile with a staged muster flag now clears that flag through the same reliable update that clears ownership, instead of a separate message that could be dropped"
    ]
  },
  {
    createdAt: 1789848292584,
    introducedIn: "2026.09.19.1",
    title: "AI actions now recover from unreachable beacons and full FOOD slots",
    why: "AI action planning now checks relay-beacon settlement reach before issuing SETTLE and remembers rejected action targets until the relevant world state changes, so live empires no longer loop on commands the runtime will reject.",
    changes: [
      "Relay-beacon settlement uses the same reach and town/dock exemption as the runtime",
      "A rejected FOOD-capacity build now prefers reversible FOOD-slot relief and explains when no safe relief exists"
    ]
  },
  {
    createdAt: 1789852188214,
    introducedIn: "2026.09.19.01",
    title: "Mintworks descriptions now show all gold bonuses",
    why: "The Mintworks description highlighted the town production multiplier but omitted its flat base-income bonus and one-time completion reward.",
    changes: [
      "Mintworks descriptions now show +1 base gold income, +10% town gold production per copy, and +10 instant gold on completion"
    ]
  },
  {
    createdAt: 1789852272082,
    introducedIn: "2026.09.19.2",
    title: "Muster flags can now keep several attacks moving at once",
    why: "An ADVANCE or MARCH flag previously stopped after its first attack until the combat or expansion timer finished, leaving nearby fronts idle even when the flag had enough mustered manpower.",
    changes: [
      "Each muster flag can now have up to three attacks or expansions active in parallel",
      "Mustered manpower already committed to an active attack is reserved before the next attack is launched",
      "The muster status shows when multiple actions are active"
    ]
  },
  {
    createdAt: 1789891188418,
    introducedIn: "2026.09.20.1",
    title: "Town terrain now defines economic identity",
    why: "Each town now has a persistent mechanical terrain profile, making Trade, Fertile, and Tundra Towns meaningfully different throughout their growth.",
    changes: [
      "Town overviews now show terrain-adjusted output and Arsenal District concentration bonuses for local Weapons Factories"
    ]
  },
  {
    createdAt: 1789912208606,
    introducedIn: "2026.09.20.2",
    title: "Captured towns now explain their terrain output",
    why: "Towns created before terrain identities were introduced had no stored profile and capture reports still showed generic Town values, making a coastal desert capture appear to grant only the normal 10 gold and 300 manpower.",
    changes: [
      "Legacy towns now recover their permanent Civic Character from their mechanical map biome",
      "Capture reports now show the town's Civic Character and the terrain calculation behind its gold, manpower capacity, and regeneration"
    ]
  },
  {
    createdAt: 1789926100448,
    introducedIn: "2026.09.20.3",
    title: "Town terrain now reads as part of the town sheet",
    why: "Terrain identity appeared as a verbose modifier list and could calculate an invalid internal gold value from a partial town snapshot, which made the overview difficult to trust.",
    changes: [
      "Town character and terrain output now appear directly with Gold and Manpower, using the same card system as the rest of the town overview",
      "Town overviews no longer show an internal terrain-base-gold figure"
    ]
  },
  {
    createdAt: 1789926100449,
    introducedIn: "2026.09.20.4",
    title: "Removed mountains now stay removed after a server restart",
    why: "Mountain removal only updated the live in-memory tile; the checkpoint snapshot's compaction step treated terrain as static worldgen output and never recorded the change, so a restart regenerated the world from its original seed and the mountain came back.",
    changes: [
      "Terrain changes (including mountain removal) are now saved as part of the checkpoint overlay, so they survive a server restart"
    ]
  },
  {
    createdAt: 1789926100450,
    introducedIn: "2026.09.20.5",
    title: "Aether walls and bridges no longer double-render in 3D",
    why: "The flat 2D lane/edge drawn for aether walls and bridges only had its secondary anchor/pylon glyphs skipped in the true-3D renderer, not the lane itself, so it kept painting a duplicate flat effect over the 3D renderer's own native pylons and could look like it never cleared when the effect ended.",
    changes: [
      "Aether wall and aether bridge visuals now render only through the true-3D renderer's native pylons when 3D mode is active, removing the leftover flat 2D overlay"
    ]
  },
  {
    createdAt: 1789926100451,
    introducedIn: "2026.09.17.2",
    title: "Added a Score Graph to the season-ended screen",
    why: "The season-ended screen could only ever show each player's final score, with no sense of how the standings got there -- whether the winner led wire-to-wire or overtook everyone late, or how close a comeback attempt came.",
    changes: [
      "Season-ended screen now has a \"Score Graph\" tab plotting every player's score over the course of the season as a line chart, with a legend and your own line highlighted",
      "The graph is built from a new lightweight score sampler on the server that snapshots every player's score every 8 hours (roughly 90 samples over a full 30-day season) -- it only appears once a season has enough samples to draw a line"
    ]
  },
  {
    createdAt: 1789926100452,
    introducedIn: "2026.09.20.5",
    title: "Frontier tiles outside your reach now hold on for 5 minutes before decaying, and losing one can now cut off nearby frontier of yours",
    why: "The out-of-reach decay timer for a claimed-but-unreached frontier tile was 2 minutes, which felt punishingly short. Separately, when such a tile expired it cleared without checking whether any of your OTHER frontier tiles depended on it as their only path back to a settled town or dock -- unlike every other way a tile can lose ownership (combat, abandonment, economic-structure loss), which already re-check that. A tile could sit permanently cut off and never show the same visual state combat-caused encirclement gets, until some unrelated action happened to touch that area.",
    changes: [
      "A frontier tile claimed or captured outside your reach now takes 5 minutes to decay, up from 2",
      "When an out-of-reach tile decays, any of your other frontier tiles that were only connected through it are now cut off in the same moment, instead of silently lingering until something else re-checks that territory"
    ]
  },
  {
    createdAt: 1789926100454,
    introducedIn: "2026.09.21.1",
    title: "Way stations now stop animating once their bonus is collected",
    why: "The lens glow already dimmed once a way station's bonus was activated, but its weathercock vane kept spinning forever afterward in both the 2D and 3D renderers, making an already-collected way station look like it still had something to offer.",
    changes: [
      "A way station's weathercock vane now freezes in place once its bonus has been collected, in both the 2D canvas and true-3D map renderers"
    ]
  },
  {
    createdAt: 1789926100454,
    introducedIn: "2026.09.21.1",
    title: "Gold storage cap now covers 48 hours of income instead of 24",
    why: "Your gold stockpile cap scales with your current income rate, but tech prices climb on a fixed schedule as you research more of them, independent of income. With only a 24-hour cap, a slower-growing economy could see its cap sit below the next tech's price -- and gold earned above the cap is discarded, not banked, so there was no way to save up for it faster than income itself grew.",
    changes: [
      "Gold storage cap raised from 24 hours of current income to 48 hours, giving more headroom to save toward the next tech purchase before overflow starts discarding income",
      "Food storage cap (which uses the same window) is raised from 24 to 48 hours as well, since both caps share the same underlying formula"
    ]
  },
  {
    createdAt: 1789926100455,
    introducedIn: "2026.09.21.2",
    title: "Farmstead can no longer be built on FISH tiles, and now shows up on the Actions tab while it's actually buildable",
    why: "Farmstead has never had any effect on fish production or a FISH tile's FOOD slot count (§5.3: FISH gets its own flat, tech-gated slot bonus instead, independent of any structure) -- but the build was still offered on FISH tiles, so a player could spend gold and manpower on a Farmstead there that does literally nothing. Separately, Farmstead is a build_* action, so on FARM tiles (where it matters) it only ever showed on the Buildings tab, a tab away from the default Actions tab you land on when tapping a settled tile, and it's the single most commonly reached-for building there once Agrarian Works is researched -- making a player go find it every time was needless friction.",
    changes: [
      "Build Farmstead is no longer offered on FISH tiles, since it never did anything there",
      "Build Farmstead now appears as a quick action on the Actions tab of a FARM tile's menu whenever it's researched, not yet built there, and has a free slot -- it still also appears on the Buildings tab, same as before, for players used to browsing there"
    ]
  },
  {
    createdAt: 1789926100456,
    introducedIn: "2026.09.21.3",
    title: "Way station map reveals no longer point you at ground you can already see",
    why: "The map-reveal reward always centered on the nearest town within range, regardless of whether you already had vision of it -- a way station near your own capital, or an enemy town already lit up by an ally or a Relay Beacon, could burn a way station's entire VISION roll on ground you were already looking at.",
    changes: [
      "The map-reveal reward now skips over a nearby town you already have vision of and centers on the next-nearest one you don't -- still falling back to the way station's own tile if every town in range is already visible or none is nearby"
    ]
  },
  {
    createdAt: 1789926100457,
    introducedIn: "2026.09.22.1",
    title: "A captured way station's lens no longer keeps shining on the true-3D map",
    why: "The true-3D way station overlay drew every way station's glowing lens through one shared material, whose brightness was picked once per frame from the aggregate activation state of ALL way stations on the map (bright-pulsing if any were still dormant, dim only once every last one had been captured). So capturing your own way station didn't actually dim its lens as long as any other way station anywhere on the map -- yours or an opponent's -- was still uncaptured, which is effectively always. The 2D canvas renderer already computed the glow per tile and was unaffected.",
    changes: [
      "True-3D renderer: a captured way station's lens now dims immediately and stays dim, independent of whether other way stations elsewhere on the map are still dormant"
    ]
  },
  {
    createdAt: 1789926100458,
    introducedIn: "2026.09.22.2",
    title: "A captured way station's minimap dot now updates immediately instead of waiting for an unrelated tile change",
    why: "The minimap's expensive content layer (owner tints, fog, docks, town/watchtower/way station markers) is cached and only recomputed when the tile-related state it depends on actually changes -- but that dirty check only compared the total tile count and the replay index. Capturing a way station mutates its `activated` flag on an existing tile without adding or removing one, so the check never noticed, and the way station kept showing its bright pre-capture dot on the minimap until some unrelated tile happened to appear or disappear (or a page reload rebuilt the cache from scratch) -- it was never actually stuck, just stale until the next unrelated recompute.",
    changes: [
      "Minimap: capturing a way station (or any other in-place tile change the map already tracks visually, like a watchtower activating) now redraws its minimap dot in the same frame the game state updates, instead of leaving the previous dot color in place until an unrelated tile add/remove happened to force a recompute"
    ]
  },
  {
    createdAt: 1789926100459,
    introducedIn: "2026.09.22.3",
    title: "Capturing an already-owned tile now activates a dormant watchtower or way station on it, same as claiming neutral land",
    why: "A watchtower or way station is placed during world generation regardless of who currently owns the land underneath it, so a dormant one could sit on a tile owned by another player or by the roaming Bleed faction. Winning an attack on that tile transferred ownership, but the code that flips the structure to activated (and fires its popup, activity-feed entry, and granted bonus) only ran when the tile was claimed off of neutral land, never when it was captured from another owner -- so the ability sat inert, with no popup and no activity-feed entry, until the tile's new owner abandoned it and reclaimed it as neutral land to force it through the working path.",
    changes: [
      "Winning an attack that captures a tile carrying a dormant watchtower or way station now activates it immediately, granting its bonus and showing its popup and activity-feed entry, instead of leaving it permanently inert until the tile was abandoned and re-claimed"
    ]
  },
  {
    createdAt: 1789926100460,
    introducedIn: "2026.09.22.4",
    title: "AI empires stuck at the edge of their reach can build Relay Beacons into unexplored land again",
    why: "The AI planner ran on a worker thread that used the wrong world map to decide whether unexplored tiles could be land, so it never credited unexplored land to a Relay Beacon site. An AI whose nearby resources were all claimed had no valid site and sat idle every turn, even with plenty of manpower and food slots.",
    changes: [
      "AI empires now treat tiles they haven't explored as possible land when choosing a Relay Beacon site, so they can push past the edge of their reach",
      "Unexplored tiles that sit behind two or more visible ocean tiles are treated as open sea and no longer draw beacons along a beach"
    ]
  },
  {
    createdAt: 1789926100461,
    introducedIn: "2026.09.22.5",
    title: "A disabled Relay Beacon's heliograph mirrors no longer keep spinning in the 3D map",
    why: "The 3D Relay Beacon model's mirror array and drive gears animated continuously regardless of the beacon's status, so a disabled (out-of-FOOD-slot) beacon looked identical to an active one at a glance -- there was no visual cue that it had stopped working.",
    changes: [
      "A Relay Beacon's mirror array now freezes in place on the 3D map while the beacon is disabled, and resumes spinning once it's active again"
    ]
  },
  {
    createdAt: 1789926100462,
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
    createdAt: 1789926100463,
    introducedIn: "2026.09.24.2",
    title: "Tapping a waystation now shows its status in the tile overview",
    why: "Selecting a waystation showed nothing waystation-specific, so you couldn't tell whether it was still up for capture or what it had granted.",
    changes: [
      "The tile overview shows whether a waystation is Dormant (capturable) or Active",
      "Active waystations list the permanent effect they granted and who activated them"
    ]
  },
  {
    createdAt: 1789926100464,
    introducedIn: "2026.09.25.1",
    title: "The tile overview now leads with what's special about the tile",
    why: "Waystations, buildings, natural wonders and shard sites were buried under generic ownership text like \"Frontier land is visible control\", and the waystation was a single plain sentence.",
    changes: [
      "Buildings, waystations, natural wonders and shard sites now appear at the top of the tile overview, above the generic frontier/settled text",
      "Waystations get their own block with Status (Dormant/Active), what they granted and who activated them",
      "The repeated Frontier/Settled heading and generic explanations are gone from the overview; tap the ownership label under the tile name (e.g. \"Your frontier\") to read what Unclaimed, Frontier and Settled mean"
    ]
  }
];
