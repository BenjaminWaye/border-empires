import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const BUILD_MENU_SUPPORT_SLOTS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792317575121 /* Date.now() frozen for the changelog gate */,
    introducedIn: "2026.10.18.2",
    title: "Clearer build menu on support slots",
    why: "Filling a town's support slot meant hunting past Military first, and every build said \"queues\" whenever your build slots were full.",
    changes: [
      "The Buildings tab opens on Town Support when you select one of a town's support-ring tiles",
      "Build costs no longer end in \"• queues\" when all build slots are busy; those orders still wait for a free slot as before"
    ]
  }
];
