import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_WIN_CHANCE_PAINT: ClientChangelogEntry[] = [
  {
    createdAt: 1790702571167,
    introducedIn: "2026.09.29.1",
    title: "Dragging an attack arrow now labels win chance on every enemy tile it crosses",
    why: "Picking an attack with a muster flag committed to a fight with no on-map sense of the odds -- you had to open the full combat breakdown to find out whether a target was even worth marching toward, and an earlier version that only tinted the target tile's own square read poorly against terrain.",
    changes: [
      "Both renderers: dragging the attack arrow from a muster flag now floats a \"XX%\" win-chance label (dark shadow, red/amber/green coded) over every enemy-owned tile the arrow's straight line actually crosses, using the same win-chance math as the combat preview",
      "Replaces an earlier version that tinted only the target tile and its 8 neighbors as solid colored squares"
    ]
  },
  {
    createdAt: 1790702571168,
    introducedIn: "2026.09.29.2",
    title: "You can now see your own Hold flags' shield coverage, and the win-chance labels account for it",
    why: "A Hold-mode muster flag shields nearby tiles by matching an attacker's commitment, but there was no way to see which tiles that covered before committing to an attack, and the win-chance preview ignored shields entirely, sometimes showing a target as better odds than it really was.",
    changes: [
      "Both renderers: your own Hold-mode flags (and any enemy flag you currently have vision of, or that was revealed to you by a shield fight) now highlight the tiles they'd shield",
      "Both renderers: the win-chance label now reflects a lower win chance when its tile falls within a shield you already know about, instead of ignoring shields"
    ]
  }
];
