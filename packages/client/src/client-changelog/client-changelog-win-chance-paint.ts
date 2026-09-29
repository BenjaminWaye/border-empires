import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_WIN_CHANCE_PAINT: ClientChangelogEntry[] = [
  {
    createdAt: 1790450114921, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.29.1",
    title: "Marching a muster flag now paints the target tile's win chance",
    why: "Picking a March target with a muster flag committed to a fight with no on-map sense of the odds -- you had to open the full combat breakdown to find out whether a target was even worth marching toward.",
    changes: [
      "True-3D renderer: arming an existing flag's March-To target now colors that tile and its 8 neighbors from red (low win chance) to green (high), using the same win-chance math as the combat preview",
      "2D canvas renderer (accessibility fallback): not yet wired up -- separate follow-up"
    ]
  },
  {
    createdAt: 1790661196996, // frozen, newest entry
    introducedIn: "2026.09.29.2",
    title: "You can now see your own Hold flags' shield coverage, and the win-chance paint accounts for it",
    why: "A Hold-mode muster flag shields nearby tiles by matching an attacker's commitment, but there was no way to see which tiles that covered before committing to an attack, and the win-chance paint ignored shields entirely, sometimes painting a target greener than it really was.",
    changes: [
      "True-3D renderer: your own Hold-mode flags (and any enemy flag you currently have vision of, or that was revealed to you by a shield fight) now highlight the tiles they'd shield",
      "True-3D renderer: the win-chance paint now colors a target tile darker (lower win chance) when it falls within a shield you already know about, instead of ignoring shields",
      "2D canvas renderer (accessibility fallback): not yet wired up -- separate follow-up"
    ]
  }
];
