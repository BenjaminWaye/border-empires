import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOSTED_PROFILE_RESULTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Hosted sector results on your House profile",
  why: "A finish on a private hosted sector is part of your House's story, but it was played under the host's own setup, so it should not move your rating.",
  changes: [
    "Your public House profile lists your places on hosted sectors under Hosted contests.",
    "A hosted sector that closed before anyone was crowned is marked not finished.",
    "Hosted results never change your rating, contests played, best finish or wins."
  ]
};
