import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Fix: flat 2D building art drawn over town-district 3D models. Frozen createdAt lives in client-changelog-data.ts.
export const DISTRICT_FLAT_ART_OVER_3D_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Refineries no longer show a flat building on top of their 3D model",
  why: "On the 3D map, town refineries and some Great Project parts also had their flat 2D map art stamped over the 3D building.",
  changes: [
    "Titanium, Umbrite and Crystal Refineries, the Titanium Smelter, Umbrite Distillery and Crystal Cutter now show only their 3D model on the 3D map",
    "Aegis Dome and Titanium Levy parts no longer get flat art drawn on top either",
    "The 2D map is unchanged"
  ]
};
