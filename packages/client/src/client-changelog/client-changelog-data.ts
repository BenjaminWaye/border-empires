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
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_17 } from "./client-changelog-data-earlier-17.js";
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
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_37 } from "./client-changelog-data-earlier-37.js";
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
    createdAt: 1789019365999, // frozen, 1ms after the muster auto-fire march-overlay entry -- keeps ordering stable
    introducedIn: "2026.09.10.5",
    title: "Fixed a failed attack's tile-flip sometimes showing as unowned until you reselected it",
    why: "When a failed ATTACK counter-captured the attacker's own origin tile back to the defender, the server's follow-up notification for that flip (clearing the origin's muster flag) could be silently dropped for the very players who most needed it -- the attacker who lost the tile and the defender who just reclaimed it -- if the flip also happened to change either player's fog-of-war coverage of that tile in the same instant. The tile's real ownership was correct on the server the whole time; the client's cached copy just never got the update, so it kept rendering the tile as if it belonged to neither side until an unrelated reselect forced a full refetch.",
    changes: [
      "A failed attack that flips your origin tile back to the defender (or a defender reclaiming their tile) now always shows the correct new owner right away, instead of sometimes rendering as an unowned/neutral tile until you click it again"
    ]
  },
  {
    createdAt: 1789019365998, // frozen, 1ms after the Great City revert entry -- keeps ordering stable
    introducedIn: "2026.09.10.4",
    title: "Fixed a muster flag's auto-fired attack showing no march animation and flipping the tile before the siege actually resolved",
    why: "An ADVANCE/MARCH flag's attack is fired by the server, not by this client, so it never went through the code that arms the marching-company supply line in 3D (the 2D map already drew it correctly). Separately, the fight's early predicted result -- the same kind of prediction a manually-launched attack always holds back until the real resolution -- was being applied the instant the siege lock started instead, so the contested tile appeared to change hands right away, before the ~30s combat-lock countdown (and its overlay) ever had a chance to show.",
    changes: [
      "A muster flag's auto-fired ADVANCE/MARCH attack now shows the marching supply-line animation on the 3D map while its company is still traveling to the front, matching the 2D map",
      "A muster flag's auto-fired attack no longer flips the contested tile's ownership at the moment the siege starts -- the tile now stays with its current owner and shows the combat-lock overlay for the whole countdown, only changing hands once the real resolution arrives"
    ]
  },
  {
    createdAt: 1789019365997, // frozen, 1ms after the MARCH-stall fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.3",
    title: "Reverted Great City's second support ring",
    why: "Great City and Metropolis towns briefly drew support structures/tiles from a second ring (24 tiles instead of 8). That's reverted for now -- it added meaningful server cost to a hot per-tile lookup that every town of every tier paid, not just the towns actually using the second ring.",
    changes: [
      "Great City and Metropolis towns are back to the standard 8-tile support ring, same as every other tier",
      "The \"Upgrade City to Great City\" tile action no longer mentions a second ring of build tiles"
    ]
  },
  {
    createdAt: 1789017727269, // frozen, 1ms after the "10-tile radius" entry -- keeps ordering stable
    introducedIn: "2026.09.10.2",
    title: "Fixed MARCH muster flags stalling out and \"fighting\" tiles nowhere near their target",
    why: "MARCH's candidate search only considered expanding onto neutral tiles inside the flag's fixed reach border, but claiming land outside reach has always been allowed (at the cost of out-of-reach decay). A flag whose target lay just past the reach edge found no candidate anywhere near the target, silently fell back to the cheapest candidate reachable through owned territory instead -- sometimes a fight on the far side of the empire -- and just sat there reporting it, with manpower staged and nothing actually happening.",
    changes: [
      "MARCH can now expand onto neutral land outside the flag's reach border, same as a manual EXPAND already could, so a march toward a just-out-of-reach target now actually walks there instead of stalling",
      "MARCH now refuses to fire on any candidate that isn't strictly closer to the target than the flag already is, so it can no longer wander off toward an unrelated fight while reporting itself as \"on track\"",
      "When a march genuinely has nowhere to go, the flag now reports it can't find a target instead of showing a misleading \"Fighting at (x, y)\" status"
    ]
  },
  {
    createdAt: 1789017727268, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.1",
    title: "Muster flags now search a 10-tile radius instead of your whole empire, fixing server slowdowns during busy fights",
    why: "Both auto-fire modes searched by walking outward across every tile you own, every tick, for every raised flag. ADVANCE had a range limit but only applied it to the target it picked -- the search itself still crossed the entire empire and threw the far results away -- and MARCH had no limit at all. With several large empires fighting at once that became the server's heaviest work by far, which is what players saw as the game becoming unresponsive or reporting the simulation as unavailable.",
    changes: [
      "Muster flags (ADVANCE and MARCH) now look for targets within 10 tiles of the flag, instead of anywhere in your territory",
      "A MARCH can no longer divert to attack something on the far side of your empire; it stays on the local route toward its target, picking the shortest way there whether that means expanding or attacking",
      "No change to how a target is chosen within range -- only how far the search reaches"
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
  {
    createdAt: 1788643300000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.03",
    title: "Galactic Fleets and raids (backend only -- not reachable from the UI yet)",
    why: "The galactic meta-layer's Senate could already force a territory's Stability to 0 and even spin up a Defense Campaign for it, but there was still no actual military option in the galaxy -- Fleets were the one core system from the design doc that didn't exist at all. This ships a first backend slice: build a fleet from the doc's hull classes (Scout/Raider/Battleline/Dreadnought/Tanker), send it at a held territory, and once its travel time elapses it automatically resolves as a raid against that territory's Stability, net of any Garrison Production invested there. There is no client UI for any of this yet -- it's reachable only via new HTTP endpoints -- so no real player can trigger it today; this entry exists only because the changelog gate covers server behavior changes too.",
    changes: [
      "New endpoints: POST /hq/galaxy/fleets/blueprints (save a reusable composition), GET /hq/galaxy/fleets/blueprints, DELETE /hq/galaxy/fleets/blueprints/:id, POST /hq/galaxy/fleets/send (launch a fleet at a held territory, costing Production), GET /hq/galaxy/fleets (your own fleet orders), GET /hq/galaxy/fleets/log (the public battle log), POST /hq/galaxy/garrison/invest (spend Production on a territory's standing defense)",
      "A fleet's travel time is set by its slowest hull -- a Scout arrives fast, a Dreadnought is slow enough to give the defender a real window to react, matching the design doc's intent",
      "A raid deals damage equal to its committed Production 1:1, absorbed first by the target's Garrison up to its own value, with the remainder forced onto the target's Stability -- hitting 0 enqueues a Defense Campaign for it, same as a passed Senate CONTEST",
      "A fleet made up only of Scouts (or Scouts plus Tankers) is a pure recon mission -- it reveals the target's current Garrison instead of dealing damage",
      "Every raid resolution posts to a new public battle log (attacker, defender, outcome), regardless of who's watching",
      "Exploration/fog-of-war (the design doc's other half of this build phase) is deliberately not included in this pass -- a raid targets a territory the sender already knows about from the public galaxy listing"
    ]
  },
  {
    createdAt: 1788641189774, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.03",
    title: "Setting a waypoint on a dock across the water now sails there instead of marching overland",
    why: "Clicking a dock linked to one of your own docks planted the flag but planned an overland expand chain from whichever tile of yours happened to sit closest to it, pushing the whole chain through undiscovered ground rather than taking the free sea crossing you already own. The route planner scored candidate routes by straight-line distance to the target, which knows nothing about dock links, so it locked in the first land route it stumbled onto before the much cheaper dock crossing was ever considered.",
    changes: [
      "A waypoint on a dock connected to a dock you own now plans the sea crossing as its first step, so the expansion starts on that dock and settles outward from there instead of walking a long chain of claims through unexplored terrain"
    ]
  },
  {
    createdAt: 1788640977095, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.03",
    title: "Aether Wall gets real 3D pylons, strung with pulsing electricity, on the true-3D map",
    why: "Aether Wall's glowing barrier segments only ever rendered as flat 2D pylon icons, painted over the 3D scene the same way they'd be painted over the old 2D map -- everyone else's abilities (like Aether Bridge) got physical 3D anchors, but Aether Wall's endpoints still looked like sprites floating over the terrain when the true-3D renderer was active, with nothing visibly linking them.",
    changes: [
      "On the true-3D map, each Aether Wall segment's endpoints are now real frosted-crystal pylons standing on the terrain instead of flat 2D icons",
      "Each pair of pylons along the wall is now joined by a jittering, pulsing electric arc, so the barrier reads as a live current instead of two disconnected props",
      "The wall's glowing beam itself is unchanged in both renderers; the 2D map's flat pylon icons are unchanged too"
    ]
  },
  {
    createdAt: 1788639424368, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.05.02",
    title: "Aether Bridge, Siphon, Worldbreaker Shot, Sky Dock Bombard and Aether Wall are usable again",
    why: "Those five crystal actions still checked your CRYSTAL stockpile before arming. But crystal (like food, titanium and umbrite) stopped being stockpiled when resource slots came in -- your balance is now always zero, and the server charges resource slots instead. So every click was refused with \"needs 30 CRYSTAL\" (or 15, 500, 1 and 25), which also spammed the feed every time you tried.",
    changes: [
      "Arming Aether Bridge, Siphon, Worldbreaker Shot, Sky Dock Bombard or Aether Wall no longer fails on a crystal balance you can never accumulate",
      "The repeated \"needs N CRYSTAL\" feed warnings are gone",
      "Real costs are unchanged: tech unlocks, resource slots, cooldowns, and Worldbreaker Shot's 1,000 gold all still apply"
    ]
  },
  {
    createdAt: 1788565039861, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "March flags now show real troop movement while fighting through neutral ground toward their target",
    why: "A MARCH-mode muster flag with no attackable enemy tile in range falls back to expanding onto the nearest neutral tile blocking the route to its target, making real progress toward it every tick. But that fallback's ACTION_ACCEPTED broadcast was silently dropped client-side -- this client never submitted the auto-fired command, so it had no matching in-flight action for the normal gate to bind it to -- unlike the equivalent ATTACK-mode fallback, which already gets a second chance via COMBAT_START. The result: a March flag chewing through neutral land toward its target looked completely stationary, indistinguishable from one that was actually stuck.",
    changes: [
      "A March flag's neutral-tile expansion toward its target now draws the same marching/travel visual an Advance or March attack already gets, in both the 3D and 2D map renderers",
      "The 2D map's supply-line overlay now also covers Advance/March auto-fire moves directly (previously it only found them via an Advance-only fallback lookup, missing March mode and any neutral-tile expansion leg entirely)"
    ]
  },
  {
    createdAt: 1788558265905, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "Building a structure on a forest tile now clears its trees in the true-3D renderer too",
    why: "The true-3D renderer added a forest instance to every forest tile unconditionally, with no regard for whether an economic structure had since been built there -- so trees kept showing through/around a built structure in 3D even though the 2D canvas renderer already correctly clears them (its structure sprite paints over the tile). The two renderers disagreed on what a built forest tile should look like.",
    changes: [
      "The true-3D renderer no longer places a forest tree instance on a tile once an economic structure is built there, matching the 2D renderer's existing behavior"
    ]
  },
  {
    createdAt: 1788555326849, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Attacks that couldn't stage a new muster flag, or whose staged flag wasn't right on the border, now still launch",
    why: "Attacking an enemy-owned tile with no adjacent or remotely-funded ready flag nearby makes the client auto-create a fresh muster flag on your origin tile to stage the attack. If you were already at your muster-flag cap, that auto-create was silently rejected with MUSTER_LIMIT and the attack just sat parked until a 5-second timeout cancelled it outright. Separately, a staged attack only ever launched once its funding flag literally bordered the enemy tile, even though the server funds an ATTACK from any owned flag within 10 tiles of wherever you're actually attacking from -- the same remote-funding range ADVANCE auto-fire already relies on -- so a flag a few tiles back that had already filled up never got used.",
    changes: [
      "When staging a new muster flag for an attack hits the muster-flag cap, the attack now reroutes onto your closest usable existing flag and waits for it to fill/march instead of being cancelled",
      "A staged attack now also launches once any owned flag within remote-funding range of your attacking tile is ready, not only one standing directly on the enemy's border",
      "A feed message now explains when a reroute happens, naming which existing flag the attack will use"
    ]
  },
  {
    createdAt: 1788554890356, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Aether Purge is now actually blocked by a defending Aether Tower",
    why: "The only real check AETHER_LANCE (\"Aether Purge\") ran server-side was for an enemy Aegis Dome -- an enemy Aether Tower's protection was purely a client-side courtesy that only decided what a well-behaved client greyed out as untargetable, so it never stopped the ability from actually landing. A target within a defending, active, off-cooldown Aether Tower's protection radius could still be purged.",
    changes: [
      "AETHER_LANCE (Aether Purge) now rejects server-side when the target is within an enemy's active, off-cooldown, non-dormant Aether Tower's protection radius, matching what the client already implied was true"
    ]
  },
  {
    createdAt: 1788522282038, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.2",
    title: "Researching Grand Bazaars, Grand Levy Doctrine, and other Aether Tower-powered techs also unlocks the Ambaric Transformer Station",
    why: "Imperial Exchange, Titanium Levy, World Engine, Aegis Dome, Astral Dock, Airport, and Radar System all need a nearby active Ambaric Transformer Station (Aether Tower) to power their abilities -- but the tower's own tech (Ambaric Engineering) lived in a completely separate branch (plastics/industrial-extraction) from any of theirs. A player could research and build one of those seven, then find its ability permanently unusable unless they also detoured through an entire unrelated tech branch just to be able to build the tower it needs power from, with no warning anywhere in the tech tree that the two were linked.",
    changes: [
      "Researching any of Grand Bazaars, Grand Levy Doctrine, Worldbreaker Doctrine, Aegis Doctrine, Astral Doctrine, Sky Vessel Engineering, or Resonance Detection now also unlocks the Ambaric Transformer Station for free, immediately",
      "Ambaric Engineering is no longer a separate, standalone tech to research on its own -- it's only ever granted as part of researching one of the 7 techs above",
      "Each of those 7 techs now shows an \"Aether Tower\" tag on its tech-tree card, so it's visible up front that researching it also unlocks the Ambaric Transformer Station"
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_17,
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
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_37
];
