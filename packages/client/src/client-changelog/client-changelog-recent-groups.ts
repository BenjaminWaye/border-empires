import type { ClientChangelogEntry } from "./client-changelog-data.js";
import { CLIENT_CHANGELOG_ENTRIES_FARMLAND } from "./client-changelog-farmland.js";
import { CLIENT_CHANGELOG_ENTRIES_MUSTER_STAND } from "./client-changelog-muster-stand.js";
import { CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER } from "./client-changelog-parallel-muster.js";
import { CLIENT_CHANGELOG_ENTRIES_SELF_PROFILE_CHIP } from "./client-changelog-self-profile-chip.js";

// Small per-feature entry files, gathered so client-changelog-data.ts stays under the 500-line cap.
export const CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS: ClientChangelogEntry[] = [
  ...CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER,
  ...CLIENT_CHANGELOG_ENTRIES_SELF_PROFILE_CHIP,
  ...CLIENT_CHANGELOG_ENTRIES_FARMLAND,
  ...CLIENT_CHANGELOG_ENTRIES_MUSTER_STAND
];
