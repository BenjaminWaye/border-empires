import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_BUILD_SPEED_MENUS: ClientChangelogEntry[] = [
  {
    createdAt: 1791656915915, // frozen Date.now() value for this release
    introducedIn: "2026.10.10.2",
    title: "Build menus include your build-speed bonuses",
    why: "Domains like Dwarf Kingdom (forts 50% faster) and Cogwork Foundries (town buildings 25% faster) already sped up your builds, but the build menu still showed the slower base time.",
    changes: [
      "Build menu times, garrison + build totals and structure info cards now include your fort, siege and economic build-speed bonuses",
      "A new build's progress bar starts with the bonus-adjusted finish time instead of jumping when the server confirms"
    ]
  }
];
