import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INCUBATION_ENGINE_BURST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Incubation Engine now grants +50,000 population",
  why: "The old +10,000 burst was small enough that a town regrew it on its own, so the Incubation Engine was rarely worth its slot.",
  changes: [
    "A finished Incubation Engine now adds +50,000 population to its town at once, up from +10,000. That is half the way to City size in one build. Its cap rises by the same amount.",
    "The +10% ongoing population growth is unchanged. Free Incubation Engines from the Colonial Charter also grant the larger burst."
  ]
};
