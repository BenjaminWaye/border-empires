// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_5: ClientChangelogEntry[] = [
  {
    createdAt: 1788071064537, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.1",
    title: "An Aether Condenser (or Titanium/Umbrite Works) in Sell Off mode now boosts its own town's gold, like Mintworks",
    why: "Sell Off mode gold used to always pay out as separate empire-wide income with no connection to any town, so building one in a town's support ring -- the same ring Mintworks, Garrison Hall, and Clearing House already boost that town from -- had no visible effect on that town's own gold production or its overview modifier list, which read as the building's income going nowhere.",
    changes: [
      "An active Sell Off (EXCHANGE mode) Aether Condenser, Titanium Works, or Umbrite Works (including Advanced tiers) built in a town's support ring now adds its gold straight into that town's own gold production instead of paying out as separate empire income",
      "The town's overview now shows a \"Sell Off gold\" modifier under a \"<count> <Building>\" heading for these buildings, matching how Mintworks and other support-ring buildings already show their contribution",
      "A converter built outside any town's support ring is unaffected -- its gold still pays out as separate empire income exactly as before"
    ]
  },
  {
    createdAt: 1788115016608, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.4",
    title: "Observatories now rise as aether towers on the 3D map",
    why: "The richest aether nodes on the map had no landmark -- a knowing eye could see the survey lines flickering, but the land itself still read as featureless grassland. Observatories rendered as a generic structure mesh, so the network (and the strategy around holding the strong aether fields) was invisible at a glance.",
    changes: [
      "Placing an Observatory on the 3D map now raises a tall brass-and-iron aether tower with a glowing cyan core, floating brass rings and upward-streaming motes, instead of the old generic structure mesh",
      "Observatories placed near each other light up thin cyan aether conduits with brass rails, collar joints, light nodes and travelling energy pulses, so a connected network reads as a visible web",
      "Where several observatories stand close together a rotating geometric synchronization cluster forms between them, marking the strongest aether convergence on the map"
    ]
  },
  {
    createdAt: 1788129225675, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed a dock's yellow dashed sea-route line not drawing (\"route not found\") for most players",
    why: "The client routed dock pairs by re-running its own procedural terrain walk from scratch, but that procedural terrainAt() is a best-effort approximation that drifts from the frozen terrain the server committed at worldgen time (worldgen_baselines). On many worlds the client's approximation found no contiguous sea path where the server's real terrain clearly had one, so the dashed connection line silently never rendered and the dock debug reported routeFound:false -- even though a valid sea route existed.",
    changes: [
      "Dock sea routes are now computed once, server-side, from the authoritative worldgen terrain and shipped to the client with the initial world payload, so the dashed connection line and its route-found status match the real, frozen terrain",
      "Already-running seasons self-heal their dock routes on the sim's next restart -- no season reset needed",
      "Older servers that don't ship a route still fall back to the client's own sea-route pathfinder, so nothing regresses for them"
    ]
  },
  {
    createdAt: 1788165381558, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.2",
    title: "Added a confirmation prompt before breaking an alliance",
    why: "Breaking an alliance takes 24 hours to actually go into effect, but the \"Break Alliance\" button fired immediately with no warning -- a stray click could start that clock by accident.",
    changes: [
      "Clicking \"Break Alliance\" now shows a confirmation dialog reminding you that the break takes 24 hours to complete, before the request is sent"
    ]
  },
  {
    createdAt: 1788165165486, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed dock sea-route lines not showing at all",
    why: "The prior fix that moved dock sea-route computation server-side never actually reached players -- the wire types between the simulation and the gateway (and the runtime's own exported dock state) were never updated to carry the new route field, so it was silently dropped before the gateway could attach it to a dock pair, and every dock fell back to the client's still-unreliable route computation.",
    changes: [
      "Dock-to-dock sea route lines now render again, using the server-computed authoritative route"
    ]
  },
  {
    createdAt: 1788127049993, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.6",
    title: "The Buildings tab now shows Palisade and Fort options on a Relay Beacon tile",
    why: "The server was already updated to let a Palisade or Fort build go ahead on a tile with an existing Relay Beacon, but the Buildings tab's own menu logic still hid both options outright whenever any economicStructure was present -- so a Relay Beacon tile's Buildings tab showed only Observatory, with no way to even attempt the build the server now allows.",
    changes: [
      "The Buildings tab now shows \"Build Palisade\" and \"Build Fort\" on a tile with an existing Relay Beacon, matching what the server already permits"
    ]
  }
];
