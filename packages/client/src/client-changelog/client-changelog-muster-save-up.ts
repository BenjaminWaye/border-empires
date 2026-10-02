import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_MUSTER_SAVE_UP: ClientChangelogEntry[] = [
  {
    createdAt: 1790774710597, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.5",
    title: "ADVANCE flags save up for the nearest target",
    why: "An ADVANCE flag that couldn't yet afford a nearby settled tile kept spending its manpower on cheaper frontier tiles farther away, so it never built up enough to attack the settled one.",
    changes: [
      "An ADVANCE flag now waits and saves up for its nearest enemy tile instead of attacking cheaper tiles behind it",
      "If the nearest tile (a high-tier fort, say) costs more than the flag can hold, the flag skips it and keeps attacking what it can afford; Expand Capacity raises what a flag can hold",
      "The flag's status now tells you which tile it is skipping and how much manpower it would need"
    ]
  },
  {
    createdAt: 1790885301041, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.1",
    title: "Muster flags have a cap again, and Expand Capacity is back",
    why: "With no cap, one muster flag could drain your entire manpower pool, especially now that an ADVANCE flag saves up for expensive targets.",
    changes: [
      "A muster flag holds at most 150 manpower, or 10% of your manpower cap if that is larger",
      "Expand Capacity returns on the flag's tile menu: each press raises that flag's cap by another 10% of your manpower cap, up to the cap itself"
    ]
  }
];
