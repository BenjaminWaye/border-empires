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
    createdAt: 1788091013204, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.2",
    title: "Mercantile Charter's \"first three towns\" no longer counts a bare starting settlement",
    why: "Every settled tile carries basic town data, not just a player's actual named/grown cities -- so an early, unnamed starting settlement silently occupied one of Mercantile Charter's three bonus slots ahead of the player's real towns, exactly matching the domain's own description (\"your first three cities\") but not what it actually checked. An established player with more than a couple of settled tiles could end up with none of their real towns receiving the bonus at all.",
    changes: [
      "Mercantile Charter's first-three-towns bonus now only considers TOWN tier and above -- a bare settlement can no longer take one of the three slots"
    ]
  },
  {
    createdAt: 1788091180198, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.3",
    title: "Fixed the Gold Production stat not matching its own \"Sell Off gold\" modifier line",
    why: "The tile popup's gold-production number and its \"MODIFIERS\" list are computed on two separate code paths in the gateway's tile-detail lookup. The modifiers list was already fixed to detect a support-ring converter correctly, but the gold-production number's own formula was never updated to include it, so the two figures on the same screen disagreed -- and a Refine-mode converter (which earns no gold) could incorrectly show a \"Sell Off gold\" line at all.",
    changes: [
      "A settled town tile's Gold Production number now includes a support-ring Sell Off converter's contribution, matching the modifier line below it",
      "A converter in Refine mode no longer shows a \"Sell Off gold\" modifier it doesn't actually earn"
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
    createdAt: 1788128033639, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Renamed the Observatory and Ambaric Tower",
    why: "Two structure names were due for a refresh to better fit the empire's aether/power theming.",
    changes: [
      "The Observatory is now called the Aether Tower everywhere in the UI (build menu, tile overview, tech unlocks, upkeep) -- no change to what it does",
      "The Ambaric Tower is now called the Ambaric Transformer Station everywhere in the UI -- no change to what it does"
    ]
  },
  {
    createdAt: 1788162346509, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed a fake \"plundered FOOD\" notice on town captures",
    why: "Capturing a settled FARM/FISH tile always showed a \"Plundered 1 FOOD\" line in the combat alert, but plunder has only ever transferred gold -- no food was ever actually taken from the defender or given to the attacker.",
    changes: [
      "Combat/raid alerts no longer show a fake FOOD plunder amount when capturing a resource tile -- plunder remains gold-only, matching what actually happens to both players' stockpiles"
    ]
  },
  {
    createdAt: 1788162890008, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed a town's full tile detail sometimes showing stale data right after opening it",
    why: "Opening a tile's full detail (or the debug download tool) reused the same \"only send what changed\" logic as the regular live tile updates -- so if nothing else about the tile had changed since the last regular update, fields like a town's bonus modifiers were silently left out of the response, and the client kept showing whatever it already had cached, which could be out of date.",
    changes: [
      "Opening a tile's full detail now always fetches the complete, current data instead of a partial update that can omit fields nothing else recently touched"
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
    createdAt: 1788128033639, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Renamed the Observatory and Ambaric Tower",
    why: "Two structure names were due for a refresh to better fit the empire's aether/power theming.",
    changes: [
      "The Observatory is now called the Aether Tower everywhere in the UI (build menu, tile overview, tech unlocks, upkeep) -- no change to what it does",
      "The Ambaric Tower is now called the Ambaric Transformer Station everywhere in the UI -- no change to what it does"
    ]
  },
  {
    createdAt: 1788162346509, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed a fake \"plundered FOOD\" notice on town captures",
    why: "Capturing a settled FARM/FISH tile always showed a \"Plundered 1 FOOD\" line in the combat alert, but plunder has only ever transferred gold -- no food was ever actually taken from the defender or given to the attacker.",
    changes: [
      "Combat/raid alerts no longer show a fake FOOD plunder amount when capturing a resource tile -- plunder remains gold-only, matching what actually happens to both players' stockpiles"
    ]
  },
  {
    createdAt: 1788162890008, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.1",
    title: "Fixed a town's full tile detail sometimes showing stale data right after opening it",
    why: "Opening a tile's full detail (or the debug download tool) reused the same \"only send what changed\" logic as the regular live tile updates -- so if nothing else about the tile had changed since the last regular update, fields like a town's bonus modifiers were silently left out of the response, and the client kept showing whatever it already had cached, which could be out of date.",
    changes: [
      "Opening a tile's full detail now always fetches the complete, current data instead of a partial update that can omit fields nothing else recently touched"
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
  }
];
