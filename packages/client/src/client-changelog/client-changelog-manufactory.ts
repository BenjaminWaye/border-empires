import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MANUFACTORY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792269690926, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.2",
    title: "Manufactories turn town industry into Coin credit",
    why: "The stackable economic building represents manufactured output backing offworld purchasing credit.",
    changes: ["Mintworks are now Manufactories, preserving their costs, income, stacking and Clearing House bonuses", "The Industrial Tooling Module fabricates and refurbishes equipment for local Manufactories; new construction requires the module installed on an active AFC", "New factory artwork appears in both the 3D and 2D maps; existing buildings and queued builds carry over"]
  },
  {
    createdAt: 1792270126879, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.3",
    title: "Industrial Tooling docks as a precision mill",
    why: "The Manufactory unlock deserves its own visible AFC machine.",
    changes: ["The Industrial Tooling Module now has a dedicated 3D milling gantry with a moving spindle, rotating drive wheel and tool rack", "The 2D map shows a matching gantry symbol on AFCs with tooling installed"]
  }
];
