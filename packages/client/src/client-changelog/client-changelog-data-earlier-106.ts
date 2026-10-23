import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Split out of client-changelog-data.ts to keep it under the line cap. These
// entries had aged out of the 6-day window (historical record, unreferenced).
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_106: ClientChangelogEntry[] = [
  {
    createdAt: 1791969768256, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.14.2",
    title: "Waystation rewards show current technology names",
    why: "The tile overview showed old technology names such as Leatherworking instead of their current Manifest names.",
    changes: ["All Waystation technology rewards now use the current tech catalog name in the tile overview, including previously activated sites"]
  },
  {
    createdAt: 1791969340091, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.4",
    title: "Manifest details stay where you scroll",
    why: "Live game updates kept rebuilding Manifest details and jumping the menu back to the top.",
    changes: ["Mobile and desktop Manifest details keep their scroll position while coin and unlock status update"]
  },
  {
    createdAt: 1791970194502,
    introducedIn: "2026.10.14.2",
    title: "Hidden dock connections stay hidden",
    why: "Selecting an enemy dock lit up undiscovered linked docks on the minimap and offered navigation into fog.",
    changes: ["Selecting a dock no longer reveals hidden connections on the minimap or either map renderer", "Dock navigation only visits discovered destinations; garrisoning a dock reveals its links", "3D dock routes update as soon as linked docks are discovered, even while the same dock stays selected"]
  },
  {
    createdAt: 1792009197862, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.3",
    title: "AI empires weigh your truce and alliance offers",
    why: "AI empires accepted truces almost instantly, and repeat offers could be spammed at any player.",
    changes: [
      "AI empires now judge relative strength, shared borders, food, and past broken truces, and tell you why they accepted or declined",
      "AI empires now answer alliance offers too",
      "After an offer is declined or cancelled, you can't send that player the same kind of offer for 30 minutes (10 minutes after an unanswered truce offer expires)"
    ]
  },
  {
    createdAt: 1791920134069, // Date.now() frozen for this entry.
    introducedIn: "2026.10.13.1",
    title: "New towns on the 3D map",
    why: "Towns on the 3D map looked out of place next to the bright terrain and the AFC.",
    changes: [
      "Every town tier on the 3D map has new art: clockwork skyscrapers of glass and grey stone banded in brass, with lamplit windows and crowns of brass cog clocks, needle spires, glowing alien bulbs and finned crystals, on an octagonal base plate",
      "Towns and cities are laid out on street grids with lamplit crossings, parks and skybridges between their towers, and cities rise to a downtown of sheer glass skyscrapers",
      "Towns grow visibly through their tiers, from a few low towers round a cog lamp to a metropolis round a brass-haloed megatower crowned with an aether crystal",
      "Towns are alive: steam rises from rooftop stacks, windows flicker with lamplight, clock cogs and orreries turn, crystals spin, and airships circle the bigger cities",
      "Neighbouring towns of the same tier now face different ways, so they no longer look like copies"
    ]
  },
  {
    createdAt: 1791921253260, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Empire Integrity moves to the Economy panel",
    why: "Playtesters watched Empire Integrity fall as they expanded and read it as being punished. In fact it was still a bonus, and some updates briefly showed it lower than it really was.",
    changes: [
      "Empire Integrity now lives in the Economy panel; the top bar only shows it, with a warning, once it drops below 50% and actually reduces your coin and growth",
      "Fixed integrity sometimes showing lower than it really was (e.g. 80% for a small new empire) after changing your profile or colour, toggling auto-garrison, or using an ability"
    ]
  },
  {
    createdAt: 1791927499454, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Top bar icons are labelled",
    why: "Playtesters couldn't tell what the icons in the top-right corner opened without hovering over each one.",
    changes: [
      "Manifest, Allies, Ranks, Activity, Sharding and Settings now show their name under the icon on desktop",
      "The Alerts (bell) button has been removed from the top bar and the mobile menu while the alerts feed is reworked -- the Activity dashboard is where to see what happened"
    ]
  },
  {
    createdAt: 1791905157542, // frozen Date.now() value for this release
    introducedIn: "2026.10.13.1",
    title: "Relay Beacons show where to build them",
    why: "Playtesters placed Relay Beacons by trial and error -- dropping them inside reach they already had, or cancelling and re-placing them -- and the new-player checklist said to build a beacon without showing where.",
    changes: [
      "When nothing worth taking is in reach, the new-player checklist now marks the tile to build your Relay Beacon on, aimed at the nearest town or food you still need",
      "On that marked tile, Build Relay Beacon is tagged ★ Recommended and listed first",
      "Choosing Build Relay Beacon now lets you pick the spot first, with the new land it would reach shaded before you confirm",
      "Works on both the 3D and 2D maps"
    ]
  },
  {
    createdAt: 1792006774817, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.3",
    title: "AI empires stand down after a truce",
    why: "An AI empire kept its muster flag, and the manpower in it, up for days after signing a truce with the player it was fighting.",
    changes: [
      "An AI empire now disbands a muster flag once it has nothing left to attack, such as after it signs a truce or alliance with no barbarians nearby, and gets that manpower back",
      "AI empires no longer plant new muster flags or plan attacks against players they have a truce or alliance with"
    ]
  },
  {
    createdAt: 1791922964029, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.2",
    title: "Manifest panel tabs",
    why: "Your Manifests sat at the very bottom of the panel, below every choice.",
    changes: ["The Manifest panel has Available and Owned tabs; a Tree view / List view toggle in the panel header replaces Expand Tree, and the tree now fills the whole window", "Owned shows how many Manifests you hold, your Manifest bonuses, and your Manifests grouped by branch", "Panels on mobile use the same brass-and-leather look as on desktop instead of a blue background", "On mobile the Manifest panel uses the full screen height in both views", "The tree's zoom control sits on one row with the unlocked/ready/total counts, and the tree's bottom edge is no longer cut off"]
  },
  {
    createdAt: 1791836603366, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.1",
    title: "Combat reports for each muster flag",
    why: "Simultaneous muster attacks interrupted play with repeated battle-result overlays.",
    changes: ["Automatic muster battles appear in each flag’s Recent combat tab with unread counts", "Manpower losses show in red and coin plunder in green", "Keep up to 40 reports per flag in this browser for this season", "New results keep your reading position and leave unrelated manual orders running"]
  },
  {
    createdAt: 1791969446372, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.4",
    title: "Smoother fog reveals in the 3D map",
    why: "Fog rolling back could leave tile-shaped cuts in the glowing edge between newly explored tiles.",
    changes: ["The 3D fog and its glowing edge now stay continuous across tile boundaries during reveals"]
  },
  {
    createdAt: 1791921497137,
    introducedIn: "2026.10.13.1",
    title: "Hydrogardens no longer stand on the old farm plot",
    why: "The hydroponic glass dome was drawn on top of the conventional 3D crop-field plot, so it looked like a greenhouse dropped onto a normal farm.",
    changes: ["A built Hydrogarden now replaces the old 3D farm plot, so the dome stands on clean ground"]
  },
  {
    createdAt: 1791922549550, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.2",
    title: "Economy panel says Coin",
    why: "The economy panel still called the currency Gold while the rest of the game says Coin.",
    changes: ["The economy panel's currency card and detail heading now read Coin"]
  },
  {
    createdAt: 1791925158695, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.3",
    title: "Your border shows up as soon as you log in",
    why: "In the 3D map, your Aether Survey Line border and the dormant-frontier and rival-incursion tints could stay hidden after login until something on screen changed. If you were idle and didn't move the camera, they might never appear.",
    changes: ["The 3D border appears right after login, even with a still camera", "Reach updates from the server redraw the 3D border straight away"]
  },
  {
    createdAt: 1791925495773, // Date.now() captured once for this release.
    introducedIn: "2026.10.13.2",
    title: "Tell your own territory apart",
    why: "Every empire's reach border looked the same apart from colour, neighbours could pick near-identical colours, and enemy tiles taken inside your reach looked like your own.",
    changes: [
      "Your reach border now glows brighter and thicker with a white core and a slow pulse; other empires' borders are thinner and dimmer",
      "On your screen, rival colours that are too close to yours are shifted away from it",
      "Enemy tiles inside your reach are striped in their colour and yours, with an outline around the pocket",
      "The 2D map draws your reach border in your colour with a white core, and shows the same striping"
    ]
  },
  {
    createdAt: 1791959048426,
    introducedIn: "2026.10.14.1",
    title: "3D map shows frontier claims on time",
    why: "The 3D map timed frontier-attack claims with the wrong clock, so it often missed muster and enemy claims starting or ending until something else refreshed the map.",
    changes: ["An enemy's frontier colour clears as soon as your muster attack's claim sweep begins", "Your frontier tile's colour clears as soon as an enemy's claim sweep begins on it", "A frontier tile's colour comes back as soon as a claim ends"]
  },
  {
    createdAt: 1791971113032,
    introducedIn: "2026.10.14.2",
    title: "Next manpower batch front and centre",
    why: "The manpower panel buried when your next batch arrives inside a long paragraph, and showed the time until full as raw minutes like \"738m 18s\".",
    changes: [
      "The manpower panel now shows \"Next batch in ...\" as a large callout at the top in hours and minutes, e.g. \"0h 19m\" (or \"Full\" / \"Paused\")",
      "Time until full also reads in hours and minutes, e.g. \"Manpower full in 12h 19m\"",
      "The explanation of how manpower works is tucked behind a \"?\" toggle"
    ]
  },
  {
    createdAt: 1791970096634, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.3",
    title: "AI names in Alliances",
    why: "The Alliances tab showed generic AI numbers instead of the empires' names.",
    changes: ["Met AI empires and allies show their seasonal names", "Alliance and truce offers still reach the correct AI"]
  },
  {
    createdAt: 1791977894863,
    introducedIn: "2026.10.14.4",
    title: "Testing new outlines for enemy land inside your border",
    why: "Enemy tiles taken inside your reach only get a plain outline, which doesn't read as a break-in. Admins are trying new looks on the 3D map before one becomes the default.",
    changes: [
      "Nothing changes for players yet: the outline stays as it is until a new look is chosen",
      "Admins can try a spiked front line in the attacker's colour, an ember seam, an ink bleed or an aether veil under Settings > Admin"
    ]
  },
  {
    createdAt: 1792001165636, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.5",
    title: "Coin everywhere",
    why: "Several places still called the currency gold while the HUD and economy panel say Coin.",
    changes: [
      "Structure details, Mintworks and Sell Off modifiers, upkeep lines, the Harbor Exchange, Imperial Exchange and Siege Engine entries now say coin",
      "Activity feed, raid and plunder summaries, town capture character, season-end income, the respawn prompt, natural wonder boons and two Manifest descriptions now say coin",
      "Fixed the not-enough-coin alert for attacks and frontier claims, which could miss its dedicated message because the server still said gold"
    ]
  },
  {
    createdAt: 1791969150437, // Date.now() captured for this update.
    introducedIn: "2026.10.14.1",
    title: "Softer 3D map daylight",
    why: "Strong stacked lighting made terrain and pale buildings look washed out.",
    changes: ["Reduced 3D daylight and exposure to preserve surface detail", "Neutral fill light keeps terrain and building colours clearer"]
  },
  {
    createdAt: 1791970552590, // Date.now() captured for this release.
    introducedIn: "2026.10.14.2",
    title: "Manifest recommendations visible in the list",
    why: "Recommendations were hidden in details and suggested Hydrogardens without usable Farms or a need for more Food.",
    changes: [
      "Good pick now appears in both the compact Manifest list and expanded tree; click a Manifest for its explanation",
      "Building recommendations check for an owned, unoccupied tile of the required kind and available development capacity",
      "Hydroworks recommendations require a nearby active Hydrogarden that does not already have its bonus",
      "Hydrogarden, Hydroworks and Fish Food bonuses are only recommended with one spare Food slot or less"
    ]
  },
  {
    createdAt: 1791982864990, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.1",
    title: "Town resource discoveries get a lasting popup",
    why: "Important resource clues were easy to miss in brief map labels and the retiring Alerts panel.",
    changes: [
      "Town surveys use the game's brass panels, parchment text, and familiar buttons in both map renderers",
      "Unresolved resource surveys remain available in Activity → Yours with a View survey button, even beyond the 24-hour history window",
      "New surveys open a centered popup that stays until you choose View survey or Got it, even when the clue is off-screen"
    ]
  },
  {
    createdAt: 1792006593148, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.14.5",
    title: "Flags head into enemy territory instead of around it",
    why: "Marching flags could keep claiming neutral tiles beside an enemy border, and advancing flags on a dock wandered their island while fighting the enemy dock across the water.",
    changes: [
      "Marching flags now follow the straight line to their target, attacking enemy tiles on that line rather than detouring onto neutral land beside them",
      "Advancing flags on a dock keep their manpower on the fight at the linked enemy dock instead of wandering around their own island"
    ]
  },
  {
    createdAt: 1792006675564, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Snow shows up on the 3D map",
    why: "Snowfields near the poles were drawing exactly like the surrounding tundra in 3D, so the snow never appeared.",
    changes: ["The coldest polar ground now renders as white snow in 3D, matching the 2D map"]
  },
  {
    createdAt: 1792044983124, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Trade screen for truces and alliances",
    why: "Offering a truce was a single button with no way to sweeten the deal or know how it would land.",
    changes: [
      "Offering a truce or alliance opens a trade screen: add coin or Shards you give or ask for, and see the empire's mood toward you",
      "Against AI empires the screen shows live whether they would accept, and how much more coin they want",
      "AI empires remember how you treat them: taking their land, attacking, breaking truces and paying them all shift their attitude, shown on the trade screen",
      "Truce prices depend on whether you're at war and who is winning; AIs won't talk peace right after you attack, and charge more each time you buy peace",
      "Alliances need an AI that likes you and would be the largest empire in the alliance (Diplomatic Dominance goes to the largest member); AIs never pay to join one",
      "An AI gives 24h notice to leave an alliance once a partner grows larger than it",
      "AI empires counter-offer with a price you can actually pay, or tell you their price is more than you can offer",
      "Coin and Shards change hands only when the deal is accepted, and the deal falls through if either side can no longer pay",
      "Pending offers show their terms in the Alliances panel"
    ]
  }
];
