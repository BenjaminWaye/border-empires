import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FRONTIER_RESOURCES_REWORK_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793801412593, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Frontier resources are now worth fighting for",
    why: "Resin, conductive minerals, catalyst, luxury biota and precursor salvage gave a small bonus to one building each, and there were so many deposits that you rarely needed to look past your own borders.",
    changes: [
      "Resin, conductive minerals and catalyst each add manpower to your whole empire: +120 per refill for your first site of a type, +30 for each extra one. No Depot, Factory or Trade Nexus needed",
      "Luxury biota keeps large towns working. A City needs 1 biota slot, a Great City 2 and a Metropolis 3; each Cultivation Estate supplies 2. A town short of biota gives a smaller town's manpower, and the towns you have held longest are supplied first",
      "Precursor salvage gives your troops +1% attack and defense per site, up to +10%. Each field holds 3 loads: ship one to the Court from the Reclamation Works for an Imperial delivery worth a quarter of your manpower cap. The last load empties the field",
      "Salvage can't be traded or siphoned. Any developed resin, conductive, catalyst or biota site can now be pledged in a trade",
      "Deposits are rarer and larger (3–6 tiles), and each type grows only in its own terrain, so your start region won't have them all",
      "A deposit's tile menu shows what capturing it would add, or what losing it would cost you. Town menus show their biota supply",
      "Frontier resources no longer pay Coin",
      "New deposit counts and terrain apply to new seasons; running seasons keep their map"
    ]
  }
];
