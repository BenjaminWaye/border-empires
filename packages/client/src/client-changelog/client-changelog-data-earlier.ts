// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [
  {
    createdAt: 1786214940000, // 2026-08-08
    introducedIn: "monument-parts-population-bureau-iron-levy",
    title: "Fixed: Population Bureau and Iron Levy monument parts couldn't be built at all",
    why: "Every other monument (Imperial Exchange, Worldbreaker Cannon, Aegis Dome, Astral Dock) has a working \"build 3 parts in different Great/Monumental Cities, then place the monument for free\" flow. Population Bureau and Iron Levy's part-building buttons existed in the menu but were wired to nothing — clicking them sent no command — and the final monument itself had no build action at all, so the 3 parts you could never even place had nowhere to go.",
    changes: [
      "\"Build Population Bureau Part\" and \"Build The Iron Levy Part\" now actually build, with the same Great City/Monumental City and one-monument-part-per-city rules as the other four monuments.",
      "Added the missing \"Build Population Bureau\" and \"Build The Iron Levy\" actions — each unlocks once you own 3 of that monument's parts and have researched its tech."
    ]
  },
  {
    createdAt: 1786217054000, // 2026-08-08
    introducedIn: "consume-monument-parts-on-build",
    title: "Building a monument now consumes its 3 Parts, and the monument's own CRYSTAL cost went up to cover it",
    why: "The 3 Parts you build to unlock a monument (Imperial Exchange, Worldbreaker Cannon, Aegis Dome, Astral Dock, Population Bureau, The Iron Levy) used to just sit there forever after the monument was placed, still eating their CRYSTAL slots for nothing. Now completing the monument clears all 3 Parts automatically, and the monument's own CRYSTAL slot requirement went from 1 to 4 to absorb what they used to occupy.",
    changes: [
      "Placing any of the 6 monuments now removes all 3 of your Parts for that monument the moment it completes.",
      "Each monument's own CRYSTAL slot cost is now 4 (was 1) — no net change to your total CRYSTAL commitment once the Parts are gone."
    ]
  },
  {
    createdAt: 1786305917000, // 2026-08-09
    introducedIn: "unique-monument-components",
    title: "Each monument now has 3 uniquely-named components instead of 3 identical Parts",
    why: "Building 3 copies of one \"Part\" structure to unlock a monument read as busywork rather than assembling something. Each monument's 3 components are now distinct, individually named structures with their own art and their own build button, and the structure-info popup shows a live checklist of which ones you've completed.",
    changes: [
      "Imperial Exchange: Golden Ledger, Counting Engine, Sovereign Seal.",
      "Worldbreaker Cannon: The Long Barrel, Fracture Core, Sky-Marking Array.",
      "Aegis Dome: Shield Lattice, Ward Anchor, Aegis Crown.",
      "Astral Dock: Launch Cradle, Orbital Array, Aether Sail.",
      "Population Bureau: Census Engine, Registry Vault, Levy Charter.",
      "The Iron Levy: Muster Klaxon, Iron Standard, Levy Writ.",
      "Opening a monument's structure-info popup now shows a \"Monument Components\" checklist with a live N/3 status for each.",
      "Same rules as before: one component per Great City/Monumental City, and the monument tech gates all 3 of its own components."
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
    createdAt: 1786267157000, // 2026-08-09
    introducedIn: "iron-titanium-deposit-overlay",
    title: "Iron tiles now show a richer metallic outcrop in 3D mode",
    why: "Iron tiles rendered as small grey ore piles, which read as minor details on the 3D map. Iron now uses the titanium-deposit outcrop mesh (bedrock lumps, bright ore chunks, tilted plates, blue-grey veins, and crystals) so mineable metal tiles are visually distinct and easier to spot.",
    changes: [
      "3D map: iron resource tiles now display a low irregular metallic outcrop with per-tile variation instead of the small ore stockpile.",
      "The visual is deterministic per tile, so it stays stable while panning and on refresh."
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
    createdAt: 1786275426380, // 2026-08-09
    introducedIn: "worldbreaker-part-models",
    title: "Worldbreaker Cannon components now render as distinct 3D models",
    why: "The Worldbreaker Cannon's 3 unique components — The Long Barrel, Fracture Core, and Sky-Marking Array — previously all drew the same generic placeholder in 3D mode, so the monument-in-progress read as a row of identical boxes instead of a piece-by-piece assembly.",
    changes: [
      "3D map: each of the Worldbreaker Cannon's 3 components now renders its own dedicated model — a tapered barrel in a brass cradle, a faceted crystal core in an iron containment ring, and a tripod targeting array.",
      "All three share the monument set's flat-shaded industrial look and its dark iron, aged brass, and stone palette."
    ]
  },
  {
    createdAt: 1786224715236,
    introducedIn: "imperial-exchange-part-models",
    title: "Imperial Exchange components now render as distinct 3D models",
    why: "Imperial Exchange component tiles had no dedicated 3D model, so on the 3D map they fell back to a flat 2D overlay and read as a placeholder rather than a monument under construction. Each of the three components you build now renders its own distinct low-poly monument component.",
    changes: [
      "3D map: each of the Imperial Exchange's 3 components now renders its own dedicated model — the Golden Ledger (an upright iron ledger with brass binding and a dull-gold seal), the Counting Engine (a brass calculating drum with tally wheels and a glowing cyan ring), and the Sovereign Seal (a ceremonial iron-and-brass seal stamp with a gold crest center).",
      "The 2D fallback overlay for component tiles is no longer drawn in 3D mode, matching other structures."
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
    createdAt: 1786396516000, // 2026-08-10 — frozen from a live Date.now() call left in astral-dock-part-models
    introducedIn: "astral-dock-part-models",
    title: "Astral Dock components now render as distinct 3D models with their own map icons",
    why: "The Astral Dock's 3 unique components — the Launch Cradle, Orbital Array, and Aether Sail — previously had no dedicated art, so on the map they fell back to a generic placeholder instead of reading as a monument under construction.",
    changes: [
      "3D map: each of the Astral Dock's 3 components now renders its own dedicated model — the Launch Cradle (a curved brass rail berth with iron brackets, mechanical joints, and violet-cyan guide lights), the Orbital Array (a slim iron mast carrying an angled grey dish with brass support arms and a violet receiver lens), and the Aether Sail (a folded grey-blue sail panel on an iron mast with a brass frame, structural ribs, and violet aether markings).",
      "2D map: each component now has its own flat overlay icon matching the monument set's muted iron/brass look with restrained violet-cyan glows.",
      "The 2D fallback overlay for component tiles is no longer drawn in 3D mode, matching other structures."
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
