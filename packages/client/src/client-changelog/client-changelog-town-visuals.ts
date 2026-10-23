import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_VISUALS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792513867571, // Date.now() captured once for this entry.
    introducedIn: "2026.10.20.2",
    title: "Richer-looking towns on the 3D map",
    why: "Towns sat on a flat grey tray with no life at street level, so even a metropolis looked like a toy model.",
    changes: [
      "Street lamps now cast warm pools of light across the paving",
      "Towers darken towards the street so they look grounded, and the stone varies from building to building",
      "Glass towers reflect the sky, and the tallest spires blink red warning lights",
      "Towns now have paved sidewalks and plazas and a kerbed edge; big cities add circling courier gyros and rooftop water tanks"
    ]
  }
];
