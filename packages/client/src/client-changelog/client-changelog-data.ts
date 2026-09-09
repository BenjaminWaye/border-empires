// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
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
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_18 } from "./client-changelog-data-earlier-18.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_19 } from "./client-changelog-data-earlier-19.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_20 } from "./client-changelog-data-earlier-20.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_21 } from "./client-changelog-data-earlier-21.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_22 } from "./client-changelog-data-earlier-22.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_23 } from "./client-changelog-data-earlier-23.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_24 } from "./client-changelog-data-earlier-24.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_25 } from "./client-changelog-data-earlier-25.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_26 } from "./client-changelog-data-earlier-26.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_27 } from "./client-changelog-data-earlier-27.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_28 } from "./client-changelog-data-earlier-28.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_29 } from "./client-changelog-data-earlier-29.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_30 } from "./client-changelog-data-earlier-30.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_31 } from "./client-changelog-data-earlier-31.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_32 } from "./client-changelog-data-earlier-32.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_33 } from "./client-changelog-data-earlier-33.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_34 } from "./client-changelog-data-earlier-34.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_35 } from "./client-changelog-data-earlier-35.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_36 } from "./client-changelog-data-earlier-36.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_39 } from "./client-changelog-data-earlier-39.js";
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
    createdAt: 1788979082413, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.1",
    title: "3D ground terrain looks more detailed and less flat",
    why: "The painted ground texture's bump/sheen detail and the flat land's height variation both read as a little too clean and uniform up close. This pushes further within the game's existing hand-painted 3D style -- not a shift to photorealism -- for terrain with more visible texture and a gentler, more natural roll to the land.",
    changes: [
      "Ground texture now has sharper relief and more contrast between duller and shinier patches",
      "Flat land gently rolls instead of reading as a dead-flat plane",
      "Hills now cast and catch shadows like the rest of the terrain, so their shaded side no longer looks flat-lit"
    ]
  },
  {
    createdAt: 1788972991596, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.7",
    title: "New worlds place real jungle, marsh, snow, and plains -- plus oases in the desert, and towns that follow rivers",
    why: "Given how much bigger this world is than a typical strategy-game map, the previous 4-biome palette (grass/sand/tundra/coastal) read as repetitive at that scale. This adds four more genuinely distinct visual biomes, oasis landmarks in the desert, and biases new-season town placement toward river paths, so following a river is a real way to find towns instead of towns being placed with no relationship to the map's rivers at all.",
    changes: [
      "New seasons place real jungle (tropical forest), marsh (wet ground near coasts/lakes), snow (the coldest tundra), and plains (a lighter, drier grassland) as genuinely distinct biomes",
      "New seasons scatter oasis landmarks -- a small lake with a fertile ring -- inside large desert regions",
      "New seasons place roughly a third of their towns along river paths, so exploring along a river is a real way to find settlements",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1788968061327, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.5",
    title: "The desert belt is now actually visible, not just a statistic",
    why: "The previous climate-band fix only biased which macro-region got picked (more CRYSTAL_WASTES/ANCIENT_HEARTLAND in the subtropical belt), but left the SAND color threshold itself unaffected -- so the belt was more 'arid region' underneath, yet still rendered as ~15-22% sand almost everywhere on the map with no visible concentration at all. The SAND threshold itself now shifts with latitude too, so the desert belt actually reads as visibly sandier on the map.",
    changes: [
      "New seasons' desert belt (roughly 15-35 degrees from the equator) now renders as clearly, visibly sandier than the equator or temperate zones, instead of sand being scattered evenly everywhere",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1788955345095, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.4",
    title: "New worlds now have real climate bands, and the equatorial belt grows its own jungle trees",
    why: "Terrain regions had zero relationship to latitude -- a desert could spawn right next to the poles, a lush forest region right at the tundra edge, nothing like how climate actually works on a real map (wet equatorial belt, an arid desert band around 15-35 degrees, temperate zones further out, then the existing tundra/polar bands). This adds that latitude bias to region selection, and gives the equatorial belt's forests a distinct tropical/jungle tree look instead of reusing the same pine/spruce trees as everywhere else.",
    changes: [
      "New seasons place desert-prone regions more often in a subtropical band, and lush forest/plains regions more often near the equator, instead of pure noise with no relationship to latitude",
      "Forest tiles within the new equatorial belt now render as a distinct tropical tree (palm-like silhouette) in both the true-3D and 2D canvas renderers, instead of the regular pine/spruce forest",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1788642265952, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.3",
    title: "Lakes now look organic, biome regions read as real places again, and a lighter grass tone + lone trees round out the map",
    why: "A perfectly circular lake reads as artificial no matter the size, so lake edges now get an irregular, wobbled shoreline instead of a mathematical circle/ellipse. Separately, the fine-grained terrain texture added earlier had its mottle-noise weight tuned too aggressively -- deserts and forests were breaking up into scattered static instead of reading as a recognizable region you could point at and call \"desert\". Rebalanced so a region still has real texture at its edges and interior without losing its shape. Also adds a lighter grass tone (a third shade alongside the existing light/dark split) and rare lone trees scattered in open grassland, independent of forest regions.",
    changes: [
      "New seasons' lakes have irregular, natural-looking shorelines instead of perfect circles/ellipses",
      "New seasons' desert, forest, and hill regions read as coherent places with organic edges again, instead of scattered speckle",
      "New seasons render an additional lighter grass tone for more visual range",
      "New seasons scatter rare, isolated trees across open grassland",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1788560338711, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.2",
    title: "Inland lakes now come in different shapes",
    why: "Every inland lake was a plain circle, stamped from the same radius roll regardless of where it landed -- so the map's lakes all read as the same repeated shape rather than distinct places.",
    changes: [
      "New seasons scatter round, elongated, and bendy wandering-shaped lakes instead of only circles",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1788559901661, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.1",
    title: "New worlds now scatter forest-ringed meadows across grassland",
    why: "Following up on the fine-grained terrain mottling below, this adds the first recognizable landmark formation on top of that texture: a circular clearing of light grass ringed by a border of forest, the way a real meadow-in-the-woods reads on a map, rather than only ever uniform noise texture.",
    changes: [
      "New seasons scatter forest-ringed meadow clearings across grassland as a real, findable landmark",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1788555902392, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "New worlds now show real, close-grained terrain variety instead of huge grass patches",
    why: "PR #1782 shrank region-noise wavelengths so hills/biome regions would break into smaller, more varied shapes instead of one giant blob spanning the map, but the underlying noise controlling GRASS vs SAND, forest shading, and hills still changed value very slowly from tile to tile -- so even smaller regions still read as solid, unbroken grass for dozens of tiles at a stretch. This adds a small-cell 'mottle' noise layer so those fields flip within a handful of tiles the way real (and Civilization-style) terrain does, riding on a low-weight large-cell 'climate' trend so regions still read as more or less arid/forested overall.",
    changes: [
      "New seasons show desert, hills, and forest-shaded terrain interspersed with grass on a per-few-tiles scale, instead of large single-type patches",
      "Already-running seasons are unaffected -- this only applies to worlds generated from here on"
    ]
  },
  {
    createdAt: 1788986490659, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.07",
    title: "Restored Town's manpower cap after the population-tier rebalance made Thunder Bastion forts unbuildable at Town tier",
    why: "Halving every tier's manpower-cap increase (including Town's) dropped a Town-tier town's manpower cap to 945 -- below the 960 manpower a Thunder Bastion fort costs, so no Town-tier player could ever build the top fort tier. Only City-and-above tiers were meant to have their increase halved.",
    changes: [
      "Town's manpower cap/regen is back to its original (unhalved) value: 300 cap / +0.42 per-min regen, same as before the population-tier rebalance",
      "City, Great City, and Metropolis keep their halved per-tier increase, now stacking on top of Town's restored value: City 450 cap, Great City 750 cap, Metropolis 1,350 cap"
    ]
  },
  {
    createdAt: 1788954892104, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.06",
    title: "Added a \"Go to tile\" button to the capture result popup",
    why: "The on-map capture-alert popup (the card that flashes up with the result of an attack/claim/expand) already showed the tile's name and coordinates as plain text -- but unlike the Activity Feed's matching entry, it had no way to actually jump to that tile.",
    changes: [
      "The capture result popup now shows a \"Go to tile\"/\"Center\" button whenever the result names a specific tile, matching the Activity Feed's existing behavior",
      "Clicking it centers the map on that tile, same as the Activity Feed's button"
    ]
  },
  {
    createdAt: 1788954892103, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.05",
    title: "Space View got a full steampunk visual redesign -- brass, copper, and riveted panels",
    why: "The galactic layer's chrome, Senate panel, and Fleets panel each used a different generic dark-UI palette that didn't feel like part of the same game, let alone a future-steampunk empire.",
    changes: [
      "Space View's top bar, launcher, and settings panel now use a shared brass/copper instrument-panel look -- aged leather and gunmetal backgrounds, amber-glow brass accents, parchment-cream text",
      "The Senate panel now reads in verdigris-copper and the Fleets panel in forge-copper/orange, each keeping a distinct accent on top of the same shared base so the panels stay easy to tell apart",
      "Incoming-raid warnings in the Fleets panel keep their red alarm color on purpose -- that's a deliberate warning, not part of the decorative theme",
      "The first-visit Voyager's Briefing modal is now reconciled with the same palette"
    ]
  },
  {
    createdAt: 1788954702870, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.04",
    title: "Space View now greets first-time visitors with a briefing on what the galactic layer actually is",
    why: "Entering Space View for the first time dropped you straight into a 3D galaxy with a Senate button, a Fleets button, and no explanation of what any of it does, what Influence/Production are for, or how a raid works.",
    changes: [
      "First time you open Space View, a one-time \"📜 Voyager's Briefing\" explains what the galactic layer is, your Influence/Production economy, the Senate, Fleets, Garrison defense, and how to navigate the 3D map",
      "Dismissing it (or clicking outside the card) is remembered for good -- it won't show again on this or any other device you're signed into"
    ]
  },
  {
    createdAt: 1788951636486, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.03",
    title: "Space View now warns you when a raid is inbound at one of your territories",
    why: "Sending a fleet against a rival was completely invisible to them until it landed -- there was no way to know an attack was coming, no time to react, no counterplay at all.",
    changes: [
      "A pulsing red warning ring now appears around any of your solar systems with a raid en route, distinct from the existing orange \"contested\" ring",
      "The Fleets panel now shows a dedicated \"⚠️ Incoming\" section listing which of your territories are threatened and roughly when the fleet arrives",
      "Deliberately anonymous: who's attacking and what they're bringing stay hidden until the raid actually resolves -- you get a warning, not a spoiler",
      "New GET /hq/galaxy/fleets/incoming endpoint powers this"
    ]
  },
  {
    createdAt: 1788950228122, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.02",
    title: "Space View: click a system to fly the camera to it, instead of being stuck orbiting the whole galaxy",
    why: "Player feedback: there was no way to move around in Space View's 3D galaxy -- the camera only ever orbited one fixed point at the galaxy's origin, so you could zoom in/out and rotate the whole cluster of systems but never actually go look at one up close.",
    changes: [
      "Clicking an unfocused system now flies the camera to it (keeping your current viewing angle) so you can freely orbit and zoom around just that one system",
      "Clicking the system you're already focused on now commits to entering its Sector",
      "Clicking empty space, or the new \"Galaxy View\" button in the top bar, flies the camera back out to the full galaxy view",
      "The camera can now zoom in much closer (down to a single system's own scale) than the old fixed minimum distance allowed"
    ]
  },
  {
    createdAt: 1788904106589, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.01",
    title: "Activity Feed now shows tile coordinates for plain-terrain conquests",
    why: "When a captured tile had no town, dock, or resource on it, the Activity Feed just said e.g. \"Tundra was conquered from Empire X\" with no way to tell which of your many tundra tiles it meant -- unlike town/dock/resource captures, which already read distinctly by name.",
    changes: [
      "Conquest entries for plain terrain now include the tile's coordinates, e.g. \"Tundra (12, 34) was conquered from Empire X\"",
      "The existing \"Center\" button on these entries still jumps the map straight to that tile"
    ]
  },
  {
    createdAt: 1788904106588, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.05",
    title: "Fixed: Space View's Senate/Fleets/Settings tabs stacked instead of replacing each other",
    why: "Player-reported: clicking a different top-right tab in Space View while one was already open didn't close the previous one -- each of the three toggle buttons only ever flipped its own panel's visibility, with no idea the other two existed, so opening Fleets while Senate was open just stacked Fleets on top of it instead of replacing it.",
    changes: [
      "Opening the Senate, Fleets, or Settings tab in Space View now closes whichever of the other two was already open, so only one panel is ever visible at a time",
      "Clicking a tab's own button while it's already open still just closes it, unchanged"
    ]
  },
  {
    createdAt: 1788902995508, // frozen, 2ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.4",
    title: "Removed the Shard storage cap",
    why: "Shard was capped at just 3 in storage, one of the tightest caps in the game. With Wonder parts now also costing Shard on top of the finished Wonder, that cap meant Shard collected faster than it could be spent was wasted overflow instead of banked for the next build.",
    changes: [
      "Shard no longer has a storage cap -- collect and stockpile as much as you can gather"
    ]
  },
  {
    createdAt: 1788902995507, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.3.5",
    title: "Wonder parts now cost Shard, not just the finished Wonder",
    why: "Each Wonder's 3 prerequisite parts only ever cost manpower to build, with the Shard cost only charged on the final assembly. That let a player stockpile every part for free and made the Shard gate trivially easy to clear at the very end.",
    changes: [
      "Every Wonder part building now also costs 1 Shard to build, on top of its existing manpower cost",
      "A completed Wonder now consumes 5 Shard total across its build chain (3 for the parts, 2 for the final assembly), up from 2"
    ]
  },
  {
    createdAt: 1788902995506, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.03",
    title: "Fleets now take real build time, can hold at home as a garrison, and the Senate/Fleets target pickers say what they're for",
    why: "Player feedback: a Dreadnought costs 500 Production against a Planet's 6-8/Cycle trickle, but a fleet departed the instant it was paid for -- there was no way to just build a fleet and keep it at home, the unlabeled ⚡ speed stat next to damage read as an unexplained \"electricity\" icon, and the Senate panel's unlabeled target dropdown below the two proposal cards had no indication of what it picked.",
    changes: [
      "Sending a fleet now takes real build time (3 minutes per point of Production cost) before it actually departs -- the fleet panel shows a BUILDING status with a \"departs in ~Xh\" countdown, then TRAVELING once it's underway; the composition summary now shows a Build time alongside Cost/Damage/Travel",
      "The fleet target picker now has a \"Hold at home (garrison, no combat)\" group listing your own territories -- sending there creates a standing garrison fleet with no raid resolution, battle log entry, or Stability effect, shown with a house icon and a \"(home)\" label",
      "Each hull card's stat row now reads \"80 cost / 50 dmg / 4 spd\" instead of bare icons+numbers, so the ⚡ speed stat can't be misread as unrelated to the damage number next to it",
      "Both the Fleets and Senate target dropdowns now have a \"Target\" label and a disabled \"Choose a target...\" placeholder instead of silently defaulting to whichever option happened to load first",
      "New optional departsAt/orderKind fields on GET /hq/galaxy/fleets orders power this -- purely additive, existing callers are unaffected"
    ]
  },
  {
    createdAt: 1788876273396, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.02",
    title: "Hints and the new-player checklist now stay dismissed for good, and you can turn them off",
    why: "Discovery tips and the onboarding checklist only remembered what you'd dismissed in this browser's local storage, so clearing browser data or logging in on a different device made them reappear as if you'd never seen them.",
    changes: [
      "Dismissed discovery tips, the discovery-tip mute, and onboarding checklist completion are now saved on your account (server-side) instead of only in this browser, so they stay dismissed across devices and browser data clears",
      "Added a \"Show Hints\" checkbox under Settings > Gameplay to turn discovery tips off entirely"
    ]
  },
  {
    createdAt: 1788876273395, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.01",
    title: "Activity Feed now backfills the last 24h after you log back in",
    why: "The Activity Feed was always empty right after logging in or reloading -- it only ever showed events that happened after you connected, silently discarding everything that came in while you were offline even though the server already kept that history.",
    changes: [
      "On login/reconnect, the Activity Feed now backfills entries from the last 24 hours instead of starting empty",
      "Backfilled entries, and any that arrive later while the feed panel isn't open, are marked unread with a highlighted left border so you can see what's new since you last checked",
      "Opening the Activity Feed panel clears the unread markers, same as it already did for the feed's notification badge"
    ]
  },
  {
    createdAt: 1788846244625, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.1",
    title: "Freshly-planted muster flags now show a live rate immediately instead of sitting at 0 for up to 30s",
    why: "The muster-smoothing fix from 2026.09.07.10 could only interpolate a flag's progress once the server had sent at least one real sample -- but a brand-new flag had no rate at all until the next periodic tick, up to 30 seconds later, so it sat frozen at exactly 0 with nothing to animate from.",
    changes: [
      "Setting (or planting a sibling) muster flag now stamps a correct accrual rate on the very same response, so the tile menu and manpower panel start climbing immediately instead of waiting on the next server sweep",
      "Planting a new flag also immediately refreshes the accrual rate shown on that player's other active flags (since sharing throughput across more flags changes everyone's rate), instead of leaving them stale until the next sweep"
    ]
  },
  {
    createdAt: 1788819326452, // frozen from `node -e "console.log(Date.now())"` -- was `Date.now()` on main, which check:client-changelog rejects (non-frozen) and which continuously invalidates the "keeps only the latest week" freshness window on every test run
    introducedIn: "2026.09.07.10",
    title: "Muster flag progress now animates smoothly instead of jumping every ~30s",
    why: "Manpower staged on a muster flag only updated server-side in sparse ticks, so the tile menu, manpower panel, and the 3D map's fill bar all showed frozen numbers for long stretches, then a visible jump. Sustained clicking/dragging traffic could also starve other queued actions (like the flag's own status updates) behind it indefinitely.",
    changes: [
      "The tile menu, manpower panel's Active muster flags list, and the 3D map's muster fill bar now interpolate a flag's staged amount continuously between server updates instead of holding flat then jumping",
      "The tile menu now repaints a muster tile's staged/cap readout roughly every 250ms while its menu is open, and the manpower panel's flag list now animates HOLD flags too (previously only Advance/March flags got a live repaint)",
      "Fixed a job-queue fairness issue where a steady stream of interactive commands (clicks, drags) could indefinitely starve background command types (including muster-flag status updates) queued behind them"
    ]
  },
  {
    createdAt: 1788814731427, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.09",
    title: "Fleets in flight are now visible in Space View's 3D scene",
    why: "Sending a fleet was invisible outside the Fleets panel -- the 3D galaxy scene had no idea a raid or recon mission was even underway. Nothing showed a fleet leaving your territory, traveling, or approaching its target.",
    changes: [
      "Each hull class (Scout, Raider, Battleline, Dreadnought, Tanker) now has its own distinct 3D ship model -- a small nosecone for Scout, a dart-shaped Raider, a plain Battleline hull, a larger spiked Dreadnought, and a tanker-shaped logistics hull for Tanker",
      "While your fleet is TRAVELING, its ships now fly a straight line from your territory to the target in the 3D scene, oriented to face the direction of travel, and land exactly when the order actually resolves server-side",
      "A fleet with a mixed composition shows one ship model per hull class present, arranged in a small formation, rather than a single generic marker",
      "New optional originSeasonId field on GET /hq/galaxy/fleets orders (your own first held territory at send time) purely powers this visual -- existing callers are unaffected, and a fleet from a player who holds no territory still gets a deterministic (if anonymous) launch point rather than being skipped",
      "This only shows your own fleets today -- there's no detection/visibility model yet for seeing an enemy fleet en route to your own territory"
    ]
  },
  {
    createdAt: 1788813121920, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.08",
    title: "Fleets panel redesign: hull cards, a live cost/damage/travel-time summary, and combat-report battle log entries",
    why: "Sending a fleet meant staring at five bare number inputs with no feedback on what you were building -- no visible cost, no damage estimate, no sense of how long the trip would take until you hit send. The battle log and fleet list were just plain text rows with no way to tell a recon ping apart from a raid at a glance.",
    changes: [
      "Each hull class is now a clickable card (icon, Production cost, damage, speed) with a +/- stepper instead of a bare number input, highlighting once you've added at least one",
      "A live summary above the Send Fleet button shows total Production cost, total damage (or \"Recon only\" for an all-Scout composition), and estimated travel time as you build the composition",
      "Your fleets list now shows a rocket/magnifying-glass/crossed-swords icon per order and an \"arrives ~Xh\" countdown while traveling, plus a status pill instead of plain text",
      "The battle log now renders each entry as a small combat-report card (attacker -> defender, an icon distinguishing a recon ping from a raid, and the damage/Stability outcome) instead of a plain text row"
    ]
  },
  {
    createdAt: 1788811800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.07",
    title: "Senate proposals now show a live quorum bar instead of just PENDING/PASSED/FAILED",
    why: "The Senate panel gave no sense of stakes while a vote was live -- a proposal just sat there labeled PENDING with a Vote button, no visible tally, no idea how close it was to passing or when it would resolve. Casting a vote felt like clicking into a void.",
    changes: [
      "Each pending proposal now shows an animated progress bar for its cast Dominion weight against the quorum it needs to clear, with a tick mark at the quorum threshold and a distinct-voters count (e.g. \"2/3 voters\")",
      "The bar turns green once both the quorum and distinct-voter floor are cleared",
      "Each proposal shows roughly when it resolves (e.g. \"resolves ~3h\")",
      "Raising a proposal now picks EMBARGO or CONTEST from two clickable cards showing their icon, Influence cost, and effect, instead of a bare dropdown",
      "New GET /hq/galaxy/senate fields (castWeight, totalWeight, quorumPct, distinctVoters, minDistinctVoters, resolvesAt) power this -- purely additive, existing callers are unaffected"
    ]
  },
  {
    createdAt: 1788810535277, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Fixed: a rare \"Frontier sync mismatch\" popup rejecting an attack on a tile you'd just fought over",
    why: "A losing attack's combat result can describe an unrelated effect on the target tile (like a post-attack shock marker) without saying anything about ownership at all. The client was treating that silence as \"this tile has no owner,\" wiping the real owner from its local map. If a queued action then reached that tile before the next full resync, it fired an illegal territory claim (EXPAND) at what was actually enemy-held land, got rejected, and surfaced a confusing \"Frontier sync mismatch\" warning telling the player to manually refresh.",
    changes: [
      "Combat-result updates no longer clear a tile's owner unless the server actually says ownership changed -- an update about something else on the tile (e.g. a post-attack shock timer) leaves current ownership alone",
      "This removes one cause of the \"Frontier sync mismatch\" popup and of an auto-queued action misfiring as a territory claim against land that was never actually neutral"
    ]
  },
  {
    createdAt: 1788811285234, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.1",
    title: "Forests now mix in leaf/deciduous trees, not just conifers",
    why: "Every forest tile only ever rendered conifers (pine and spruce, both cone-shaped) in both the true-3D and 2D-fallback map renderers, so forests read as visually uniform regardless of how much biome variety the terrain itself had.",
    changes: [
      "Forest tiles now mix in a third, leaf/deciduous tree species (a rounder, warmer-green canopy) alongside the existing pine and spruce conifers, in both the true-3D renderer and the 2D-canvas accessibility fallback",
      "Light-shaded grass tiles (which never had any trees at all) now get a sparse, purely decorative scattering of leaf saplings, so they don't read as completely bare next to dense dark-grass forest -- this has no gameplay effect (no vision or claim-timing change), unlike real forest tiles",
      "Each world tile's mix of tree species (and whether it gets a decorative sapling) is fixed (deterministic per-tile), so a forest -- or a light-grass tile's sapling -- doesn't flicker as you pan or reconnect"
    ]
  },
  {
    createdAt: 1788802600000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.03",
    title: "Space View: every territory is now a full solar system, not a lone sphere",
    why: "Each Planet/Outpost in Space View rendered as one bare sphere floating in the void -- reasonable as a placeholder, but a thin stand-in for a galaxy of star systems. This gives every territory a proper system: a sun, and the real, interactive territory in orbit around it alongside a few purely decorative bodies, all slowly spinning.",
    changes: [
      "Every territory in Space View now renders as a small solar system: a sun at its center, with the real, clickable territory (colored by its owned/contested/other/frontier state, same as before) orbiting it",
      "2-4 additional decorative bodies (no gameplay data attached yet) orbit further out at their own speed and distance, so every system reads as a system rather than a single sphere",
      "A system you haven't charted (an \"Unknown\" fog-of-war marker) deliberately skips the sun and decorative bodies and stays a single dim point -- showing what orbits it before you've even surveyed it would leak information charting is supposed to earn"
    ]
  },
  {
    createdAt: 1788797564605, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.05",
    title: "Removed: attack cooldown on your own origin tile",
    why: "Players reported it as feeling like a bug: attacking from a tile, then immediately trying to attack again from that same tile, was rejected with \"origin tile is still on attack cooldown\" for a few seconds even though nothing else was happening there. Removed for now; may come back later in a clearer form.",
    changes: [
      "You can launch another attack from an origin tile you just attacked from without waiting out a cooldown",
      "Attacking the same target tile again while your previous attack on it is still resolving is unaffected -- that still shows \"tile locked in combat\"",
      "An origin tile still on lock because another player is fighting over it is also unaffected -- that still blocks with the same \"tile locked in combat\" message"
    ]
  },
  {
    createdAt: 1788800800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.02",
    title: "The galaxy now has fog of war -- Scout missions reveal what's out there",
    why: "The whole public galaxy listing was fully visible to everyone from day one, which undercut Space View's own return hook (zooming out was re-reading a board you'd already read) and left the Scout hull's only job (peeking at a raid target's Garrison) too thin to justify a hull class. This ships the design doc's exploration system: a Scout mission now permanently Surveys its target, and until you've surveyed a system yourself, Space View shows it only as an unlabeled, unclaimed-looking marker.",
    changes: [
      "Sending a Scout-only fleet at a target now records a timestamped Surveyed snapshot (its Garrison and Stability) for you, in addition to the recon reveal you already got back from that one order",
      "Space View now shows any non-owned, non-contested system you haven't surveyed as an unlabeled \"Unknown\" marker instead of its real owner and name",
      "This is the Scout-mission half of exploration only -- passive vision from your own holdings' surrounding space, and the Deep Sensor Array Wonder, are deferred until the systems they depend on (a real spatial model, and Wonders) exist"
    ]
  },
  {
    createdAt: 1788798200000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.01",
    title: "Fleets are now reachable from Space View",
    why: "Galactic Fleets shipped as a backend-only slice with no way for a real player to use it -- building a fleet, sending it at a target, and reading the battle log only existed as raw HTTP endpoints. This adds the missing client surface: a Fleets panel inside Space View, next to Senate, Manage Planet, and Settings.",
    changes: [
      "New Fleets button in Space View opens a panel to compose a fleet from the five hull classes, pick a target from any publicly held territory other than your own, and send it",
      "The same panel lets you save and load reusable fleet compositions as named blueprints",
      "Your own fleets show their travel status and, once resolved, the raid's outcome (damage dealt and the target's resulting Stability, or a recon reveal for a Scout-only fleet)",
      "A public battle log shows every raid resolution galaxy-wide, regardless of who's watching",
      "Clear inline messages for the common failure cases: not enough Production, or an invalid target"
    ]
  },
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_18,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_19,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_20,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_21,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_22,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_23,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_24,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_25,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_26,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_27,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_28,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_29,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_30,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_31,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_32,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_33,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_34,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_35,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_36,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_39
];
