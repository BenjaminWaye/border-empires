import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_STOP_THE_LEADER_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794131073687, // Date.now() captured once for this entry.
    introducedIn: "2026.11.08.2",
    title: "AI empires gang up on the leader",
    why: "AI empires fought whichever neighbour was easiest, even while another empire was close to winning the season.",
    changes: [
      "AI empires that border an empire close to a victory condition prefer to attack its tiles",
      "When an empire is holding a victory condition, AI empires next to it attack as soon as they have the troops, even on fronts they were only holding"
    ]
  }
];
