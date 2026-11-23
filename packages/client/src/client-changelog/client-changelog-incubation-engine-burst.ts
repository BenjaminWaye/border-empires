import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INCUBATION_ENGINE_BURST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Incubation Engine now grants +50,000 population",
  why: "The old +10,000 burst was too small to make the Incubation Engine worth planning around.",
  changes: [
    "A finished Incubation Engine now adds +50,000 population to its town at once, up from +10,000. A bigger town also grows faster from then on. You still pay Coin to upgrade the town's tier.",
    "Each House gets the burst once per town. Removing and rebuilding the engine does not pay it again. A House that captures the town can earn its own.",
    "The +10% ongoing population growth is unchanged. Free Incubation Engines from the Colonial Charter also grant the larger burst."
  ]
};
