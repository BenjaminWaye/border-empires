import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_91: ClientChangelogEntry[] = [
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
];
