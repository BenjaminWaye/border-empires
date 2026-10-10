import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_FAST_BUILDS: ClientChangelogEntry[] = [
  {
    createdAt: 1791645956830, // frozen Date.now() value for this release
    introducedIn: "2026.10.10.1",
    title: "Buildings now finish in minutes, not hours",
    why: "Build times used to grow with manpower cost (100 manpower = 1 hour), so your build slots filled up long before you could spend your manpower in one play session. Now manpower is what limits how much you build, so you can spend a full refill in one sitting.",
    changes: [
      "Build time is now 1 second per manpower point: an 80 manpower building takes about 1.5 minutes, a 150 manpower one 2.5 minutes, and a 300 manpower one 5 minutes",
      "Removing a building now takes half its build time (0.5 seconds per manpower point), instead of a fixed 1 to 10 minutes",
      "Build menus and structure info cards now show the real build time in minutes and seconds, including each Fort and Siege tier's own time, plus the removal time",
      "Manpower costs are unchanged",
      "Buildings already being built or removed keep the finish time they had when they were started"
    ]
  }
];
