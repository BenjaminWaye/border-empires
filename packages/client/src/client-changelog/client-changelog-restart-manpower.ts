import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESTART_MANPOWER_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792108537444, // frozen Date.now() value for this release
    introducedIn: "2026.10.15.1",
    title: "Server updates no longer hand back spent manpower",
    why: "A server update restored manpower from the last save, so manpower spent shortly before an update came back while the land it bought stayed. Updates could also switch an Ancillary Depot off for food when a newer town should have gone without, lowering your manpower cap until it later switched back on and refilled you.",
    changes: [
      "Manpower you spend stays spent across server updates",
      "Server updates no longer change which towns or structures go without food, so your manpower cap stays the same"
    ]
  }
];
