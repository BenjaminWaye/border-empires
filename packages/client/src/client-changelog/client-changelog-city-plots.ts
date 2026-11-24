import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CITY_PLOTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Cities get a second ring of plots",
  why: "A full Town could have food to spare and nowhere left to build. The second ring used to wait until Great City.",
  changes: [
    "A town that grows to City draws on 24 plots around it instead of 8",
    "The upgrade to City claims the new ring for you, like capturing a town does",
    "The inner 8 plots earn the town's base coin; the City bonus grows with how many outer plots are garrisoned, so a City never earns less than it did as a Town",
    "A plot two towns can use belongs to the closer town",
    "The town screen shows inner and outer plots separately"
  ]
};
