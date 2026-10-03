import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SOFTER_METAL_REFLECTIONS: ClientChangelogEntry[] = [
  {
    createdAt: 1791059373950, // frozen Date.now() value for this release
    introducedIn: "2026.10.03.2",
    title: "Softer metal on 3D buildings",
    why: "The metal reflections on buildings and resource sites were strong enough to flatten the sun's shading and shadows, so structures looked evenly lit from every side.",
    changes: [
      "Metal reflections on 3D structures, resource sites and forts are now half as strong, so the sun's direction and shadows read more clearly on them"
    ]
  }
];
