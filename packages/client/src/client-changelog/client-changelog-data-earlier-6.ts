// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_6: ClientChangelogEntry[] = [
  {
    createdAt: 1787948853587, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.6",
    title: "Fixed out-of-reach frontier tiles that never started decaying after their covering Relay Beacon/outpost was lost",
    why: "The out-of-reach decay timer was only ever stamped once, at the moment a tile was claimed -- a FRONTIER tile claimed while still inside your reach got no timer at all. If the anchor covering it later deactivated (a Relay Beacon disabled or destroyed, a Siege Outpost lost, a town or dock lost), nothing re-evaluated that tile's coverage: it just sat as \"Outside reach\" forever with frontierDecayKind stuck undefined, since the queue that drives expiry is only ever populated at claim time and there is deliberately no world-wide sweep (the mechanic that swept in PR #627 blocked the event loop for 9 seconds and was removed for it).",
    changes: [
      "Deactivating a reach anchor now re-checks its own disk (same scoped radius²-cost pass as the existing reach-caught-up case, not a sweep) and starts the decay timer on any FRONTIER tile left in genuine no-man's-land as a result"
    ]
  },
  {
    createdAt: 1787941776652, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.5",
    title: "Agrarian Works now shows its fish-tile bonus as its own highlight chip",
    why: "Researching Agrarian Works unlocks the Farmstead structure and also grants +1 FOOD slot on every owned fish tile, but the tech-tree card and detail view only ever showed a \"Farmstead\" chip -- the fish-tile bonus was undiscoverable unless you read the full description text.",
    changes: [
      "Agrarian Works now shows a \"Fish Tiles +1 Food Slot\" chip alongside its Farmstead chip, matching how other techs (e.g. Muster Flag +1) surface numeric bonuses as their own highlight"
    ]
  },
  {
    createdAt: 1787940942955, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.6",
    title: "Removed the settled-tile and dock defense bonuses; named the missing factory in \"no war industry\" combat lines",
    why: "Owning a settled tile or a dock granted a flat defense multiplier on top of forts/tech/war-industry, which didn't make sense thematically -- being settled or having a dock isn't a defensive structure. Separately, the attack/defense breakdown's \"has no war industry\" line never said which of the two Weapons Factories (Titanium or Umbrite) you or your target were actually missing, forcing you to go check.",
    changes: [
      "Removed the +35% \"Settled tile\" and +10% \"Dock\" defense bonuses from the combat breakdown; forts, towns, tech/domain mods, and war-industry status are unaffected",
      "The war-industry line in the attack/defense breakdown now names the specific missing factory, e.g. \"Target missing Umbrite Weapons Factory\" instead of a generic \"Target has no war industry\""
    ]
  },
  {
    createdAt: 1787999763164, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.2",
    title: "Titanium Bastion and Thunder Bastion cost more manpower to build",
    why: "All three top fort tiers (Fort, Titanium Bastion, Thunder Bastion) cost a flat 300 manpower to build despite defending at very different strengths (2.5x/4x/8x), so the strongest fort in the game was no harder to raise than the weakest of the three.",
    changes: [
      "Titanium Bastion now costs 480 manpower to build (was 300)",
      "Thunder Bastion now costs 960 manpower to build (was 300)",
      "Fort and Palisade (Wooden Fort) manpower costs are unchanged at 300 and 150"
    ]
  },
  {
    createdAt: 1787999049644, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Settled tiles are defensible again",
    why: "PR #1656 removed the settled-tile and dock defense bonuses because neither is a defensive structure, but that left settled land with no baseline defense at all -- only forts, town bonus, tech/domain mods, and war-industry status contributed, so an undeveloped settled tile defended no better than open frontier.",
    changes: [
      "Settled tiles now grant a +30% defense multiplier again (previously +35%, and separate from the still-removed dock bonus), stacking with Town, forts, and other defense mults as before"
    ]
  },
  {
    createdAt: 1787999012029, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Join-season screen no longer shows a misleading \"0 players waiting\" for an already-active season",
    why: "The waiting count/roster only means something for a pending season's countdown lobby (\"N players have reserved a spot for the world that hasn't started\"). The plain join-now screen (season already active, player just hasn't clicked in yet) reused the same panel, so it showed \"0 PLAYERS WAITING / You're the first one here\" even when the world was already full of active empires.",
    changes: [
      "The already-active join-season screen now shows the Discord link and invite button without the waiting count/roster block"
    ]
  },
  {
    createdAt: 1787999215790, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Shard rain locators now clear once a shard is actually collected",
    why: "The in-world bobbing badge over a shard rain site and the off-screen HUD locator arrow pointing at one both tracked only the rain event's broadcast and its ~30-minute expiry, not the site's actual tile state -- so both kept showing a site for the rest of the event even after the shard there had already been picked up (by any player), which was misleading for everyone still navigating toward it.",
    changes: [
      "Both the in-world shard rain badge and the off-screen HUD locator arrow now drop a site as soon as that tile confirms (unfogged) the shard is gone, instead of persisting for the rest of the event"
    ]
  },
  {
    createdAt: 1787998957470, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.1",
    title: "Fixed the sign-in/name-and-color screen rendering behind a shard rain alert",
    why: "The sign-in overlay (including the new-player name/color picker) was styled at z-index 30, lower than the shard rain alert banner's z-index 33, the tech/structure detail overlays, and the season-end overlay. If a shard rain alert (or any of those overlays) became visible while a new player was still picking their name and color, it rendered on top of the picker, blocking it.",
    changes: [
      "Raised the sign-in/onboarding overlay to z-index 50 so it always sits above in-game alert and detail overlays while visible"
    ]
  }
];
