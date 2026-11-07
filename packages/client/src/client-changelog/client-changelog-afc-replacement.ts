import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_REPLACEMENT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793991829210,
    introducedIn: "2026.11.06.1",
    title: "Choose your replacement AFC landing",
    why: "Losing your last fabrication complex should create a recovery decision instead of automatically crowding the front with new AFCs.",
    changes: [
      "Losing your last AFC suspends construction and its gold and manpower contributions. A popup helps you choose your next move.",
      "Players and AI commission replacement AFCs with a 60-second landing. The first global loss quotes 20 gold; each later AFC loss on the planet adds 10 gold to the shared replacement price.",
      "Lost or obstructed landing sites cancel and refund the delivery. Pending landings and prices survive server updates.",
      "Choose a clear landing footprint, keep fighting with surviving holdings, or withdraw and redeploy with a fresh opening package. Withdrawal forfeits your territory, treasury and fielded manpower while retaining House knowledge.",
      "Pending AFC landing footprints appear in both 2D and 3D. Replacement deliveries grant no fresh manpower reserve."
    ]
  },
];
