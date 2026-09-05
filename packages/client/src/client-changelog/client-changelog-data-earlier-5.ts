// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_5: ClientChangelogEntry[] = [
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
];
