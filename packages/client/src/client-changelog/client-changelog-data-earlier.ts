// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [
  {
    createdAt: 1786410000000, // 2026.08.10.2
    introducedIn: "2026.08.10.2",
    title: "The 2D map now takes over when 3D can't run on your device",
    why: "On some phones — Safari on iPhone in particular — the 3D map could fail to start or have its graphics context taken away by the system, leaving a blank map with no explanation and no way to report what happened.",
    changes: [
      "If the 3D map can't start, or its graphics context is lost mid-session, the game now switches to the 2D map instead of showing a blank screen.",
      "A short banner explains why the 2D map is being used, with the specific reason.",
      "If loading the 3D map crashes the browser outright, the game now notices on the next visit and comes up in 2D instead of crashing again. Add ?renderer=3d to the URL to try 3D again.",
      "Downloaded diagnostics now include your device's graphics capabilities, the reason 3D was unavailable, and how far the previous 3D attempt got before the browser died — so map crashes can be diagnosed from a phone.",
      "The 3D map now sizes its memory buffers to your screen instead of always reserving for a large desktop display, which cuts its memory use substantially on phones."
    ]
  },
  {
    createdAt: 1786406400000, // 2026.08.10.1
    introducedIn: "2026.08.10.1",
    title: "Removed Bank and Exchange House; Clearing House now boosts Mintworks",
    why: "Bank and Mintworks did nearly the same thing, and Exchange House's bonus was never actually implemented — both were confusing dead weight in the tech tree and build menu.",
    changes: [
      "Removed the Bank and Exchange House structures.",
      "The Minting Works tech now unlocks Clearing House (instead of Bank).",
      "Clearing House now boosts Mintworks gold production (+25%) for its town and directly connected towns, instead of boosting Bank.",
      "Removed the Provincial Concessions tech; Grand Bazaars now requires Minting Works directly.",
      "Fixed the tech tree structure card showing two separate 'Upkeep' boxes for structures with more than one resource-slot requirement (Bank, Foundry, Rail Depot, Radar System, Exchange House, Ambaric Tower, Weapons Workshop, Assembly Works, Siege Tower, Dread Tower) — now shown as one combined box.",
      "Moved Terrain Shaping into the Aether tech branch (was miscategorized under Economy); it now requires Covert Logistics and unlocks Sky Vessel Engineering alongside its other prerequisites."
    ]
  },
  {
    createdAt: 1786530000000, // 2026.08.12.3
    introducedIn: "2026.08.12.3",
    title: "Muster ADVANCE flags launch one attack at a time",
    why: "A flag set to ADVANCE re-searched on every automation tick, so it could fire a second attack while its first was still resolving — and an underfunded flag kept re-sending a doomed strike every tick. A flag now waits for its in-flight attack to resolve before launching another, and only fires when it can actually afford the target.",
    changes: [
      "Muster flags in ADVANCE mode now wait for their current attack to resolve before launching another.",
      "A flag that can't afford an attack no longer sends the strike to the server at all."
    ]
  },
  {
    createdAt: 1786547200000, // 2026.08.12.11
    introducedIn: "2026.08.12.11",
    title: "New 3D dock overlay and matching 2D icon: a working cargo-crane pier",
    why: "Docks used a placeholder timber-deck look with a mast and flag that read as a boatyard — none of it said 'this tile is how goods move across the ocean'. Replaced it with an actual working port scene: the dock is now a heavy timber-and-iron pier with a large brass cargo crane actively hoisting a crate over the loading deck, backed by a steam winch, boiler and pipe run, a compact dockhouse with amber-lit windows, mooring posts chaining a small steampunk cargo barge alongside, and crates, barrels and lamps that make the pier feel busy and lived-in.",
    changes: [
      "Docks now render a dedicated 3D cargo port: timber-and-iron pier, tall brass rotating cargo crane with a visibly suspended crate, steam winch and boiler, compact dockhouse, moored steampunk cargo barge, mooring chains, and small amber lamps.",
      "The 2D dock icon (used where the 3D renderer is off) matches the new look: same crane, pier, cargo and barge, with strong dark outlines so it still reads at a glance.",
      "Docks are unchanged mechanically — this is purely the on-map look."
    ]
  },
  {
    createdAt: 1786399200000, // 2026-08-09
    introducedIn: "fix-dev-slot-busy-queue-sync",
    title: "Fixed a build getting rejected with \"development slots are busy\" instead of auto-queuing",
    why: "The server has only ever sent the plain message \"development slots are busy\", but the client was matching against \"all N development slots are busy\" (a format the server never sends) to learn its slot count was out of date. Since that match never fired, a stale local slot count kept letting the client try to build/expand directly instead of routing the action into the development queue, so players occasionally saw a hard rejection where the action should have queued.",
    changes: [
      "Any \"development slots are busy\" rejection now immediately marks all development slots as busy locally, so the next build/settle attempt queues instead of repeating the same failed request."
    ]
  },
  {
    createdAt: 1786413600000, // 2026.08.10.2
    introducedIn: "umbrite-deposit-overlay",
    title: "New Umbrite deposit overlay for the 3D map",
    why: "Umbrite is a new strategic resource planned around ancient forest deposits, and needed its own 3D tile visual so it reads distinctly from titanium, glass steel and ordinary rock when it reaches the map.",
    changes: [
      "3D map: added an Umbrite deposit overlay — an unnaturally dark near-black mineral vein breaking through an ancient forest floor, intertwined with thick fossilized roots, with subtle violet-blue sheen and sparse glowing orange fissures.",
      "The visual is deterministic per tile and ships with three layout variants, so adjacent deposits stay varied but stable while panning and on refresh."
    ]
  },
  {
    createdAt: 1786410000000, // 2026-08-10
    introducedIn: "aegis-dome-components",
    title: "Aegis Dome monuments now render a full defensive assembly in 3D mode",
    why: "Aegis Dome tiles drew only a bare base, core block, and translucent dome — the monument's defensive story (lattice shielding, grounding anchors, ceremonial crown) was missing from the map.",
    changes: [
      "3D map: Aegis Dome now rings its dome with three curved shield-lattice fragments (dark-iron frames, brass hex cells, one pale-cyan active cell each).",
      "Four heavy Ward Anchors (tapered iron spikes, reinforcement bands, brass cages with glowing energy orbs) pin the field at the structure's corners.",
      "A ceremonial Aegis Crown — iron base, grey ring, eight brass spikes, and a pale-cyan emissive dome cap — now crowns the apex."
    ]
  },
  {
    createdAt: 1786417200000, // 2026.08.10.4
    introducedIn: "2026.08.10.4",
    title: "New 3D Umbrite Weapons Factory",
    why: "The Umbrite Weapons Factory — a heavy military-industrial complex that forges Umbrite-tempered ordnance — now has a full 3D model, ready to be placed on the map as part of the Umbrite gameplay.",
    changes: [
      "Added a low-poly 3D Umbrite Weapons Factory: a dark-iron riveted hall with an overhanging roof and angled buttresses, twin brass-banded smokestacks, and a tall central Umbrite reactor whose ember inspection window shows the violet-black core inside.",
      "Chunky industrial pipes with coupling joints run from the reactor to a mechanical forging press and a production platform carrying standing artillery shells, plus missile-like ordnance waiting at the hall front.",
      "A brass-banded storage tank, vertical magazines and ammunition crates flank the production line, with raw Umbrite lumps and ember bits at the reactor's foot reusing the deposit palette."
    ]
  },
  {
    createdAt: 1786449600000, // 2026-08-11
    introducedIn: "next",
    title: "2D map now has SVG overlays for every structure and natural wonder that renders in 3D",
    why: "The 3D map gained several structures and all nine natural wonders that the classic 2D map couldn't draw — those tiles showed only a placeholder box, or nothing at all, so the two maps disagreed about the same world.",
    changes: [
      "New 2D SVG overlays for Seed Granary, Census Hall, Weapons Workshop, Titanium Weapons Factory, Umbrite Weapons Factory, and every World Engine and Imperial Exchange monument part.",
      "Natural wonders (Foundry Heart, Deepwater Engine, Conscription Engine, Warpress, Bastion Frame, Calculating Engine, Quickforge, Watchtower Engine, Cartographer's Lens) now render on the 2D map instead of being invisible.",
      "Each overlay matches its 3D counterpart's silhouette so the classic map and the 3D map show the same buildings."
    ]
  },
  {
    createdAt: 1786443946000,
    introducedIn: "fix/weapons-factory-build-menu-undefined",
    title: "Fixed \"undefined\" text in the Weapons Factory build menu entries",
    why: "The Titanium Weapons Factory and Umbrite Weapons Factory build options were missing their detail-text case, so the build menu literally showed the word \"undefined\" instead of a description.",
    changes: [
      "Build menu: Titanium Weapons Factory and Umbrite Weapons Factory now show a real description instead of \"undefined\"."
    ]
  },
  {
    createdAt: 1786463900000, // 2026.08.11.6 — frozen from a live Date.now() call
    introducedIn: "population-bureau-part-models",
    title: "Population Bureau components now render as distinct 3D models with their own map icons",
    why: "The Population Bureau's 3 unique components — the Census Engine, Registry Vault, and Levy Charter — previously had no dedicated art, so on the map they fell back to a generic placeholder instead of reading as a monument under construction.",
    changes: [
      "3D map: each of the Population Bureau's 3 components now renders its own dedicated model — the Census Engine (a compact horizontal brass drum in a dark iron frame with fanned parchment record cards, one separated card carrying a muted green processing glow), the Registry Vault (a squat dark-iron strongbox with reinforced brass corners, heavy hinges, a thick brass lid tilted ajar, and a restrained warm amber glow in the gap), and the Levy Charter (an upright rolled imperial decree with thick brass caps and a small unrolled section bearing a subtle gold sigil).",
      "2D map: each component now has its own flat overlay icon matching the monument set's muted iron/brass/parchment look with a single restrained emissive accent.",
      "The 2D fallback overlay for component tiles is no longer drawn in 3D mode, matching other structures."
    ]
  },
  {
    createdAt: 1786445193413, // 2026-08-11 — frozen from a live Date.now() call
    introducedIn: "revert-barley-2d-farm-overlay",
    title: "2D farm tiles show the classic wheat plates again",
    why: "The recent 2D farm overlay redraw (dense barley crops) didn't land well, so farm tiles on the 2D map are back to the previous wheat-plate look.",
    changes: [
      "2D map: farm resource tiles use the previous wheat-plate overlay style instead of the dense barley crops."
    ]
  },
  {
    createdAt: 1786453200000, // 2026-08-11
    introducedIn: "fix/dock-attack-require-foothold",
    title: "Attacking across a dock now requires capturing the dock first",
    why: "AI empires could attack land tiles merely adjacent to an enemy-linked dock without ever capturing that dock, letting them raid an island human players can only reach by first taking the dock as a foothold.",
    changes: [
      "A dock-crossing ATTACK must now land on the linked dock tile itself, for both players and AI — matching how dock-crossing EXPAND already worked.",
      "Fixes AI empires bypassing the foothold requirement that human players were always held to."
    ]
  },
  {
    createdAt: 1786454100000, // 2026-08-11
    introducedIn: "fix/dock-attack-require-foothold",
    title: "Mustering flags now fire across a linked dock",
    why: "A muster flag's auto-fire (ADVANCE mode) search only walked ordinary grid neighbors, so a flag placed on a dock could never \"see\" the enemy dock linked across the water — the flag just sat there, staged and never firing, even though a manual attack from the same tile worked fine.",
    changes: [
      "Muster flags in ADVANCE mode can now find and fire on an enemy tile across a dock link, the same way manual ATTACK commands already could."
    ]
  }
];
