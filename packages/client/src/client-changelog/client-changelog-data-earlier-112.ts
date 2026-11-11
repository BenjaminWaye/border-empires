import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_112: ClientChangelogEntry[] = [
  {
    createdAt: 1792873662311, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.24.3",
    title: "Titanium-armoured soldiers no longer collapse when they move",
    why: "The heavy armour's animations were copied from the standard soldier onto a differently shaped body, so the armour crumpled the moment a soldier ran, stood or knelt.",
    changes: [
      "Soldiers in heavy armour now stand, run, march and kneel with the same poses and arm positions as standard soldiers",
      "This is cosmetic and only shows on the 3D map"
    ]
  },
  {
    createdAt: 1792909803859, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.24.3",
    title: "Soldiers killed in battle now fall properly",
    why: "A soldier killed in a 3D battle was tipped over whole and shrunk, so they sank into a small bundle on the ground instead of falling.",
    changes: [
      "Killed soldiers, in standard or heavy armour, now play a real fall and lie full size on the battlefield",
      "On the 2D map, soldiers killed during a dock landing now fade out over about a second instead of vanishing almost at once"
    ]
  }
];
