import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SIEGE_FX_GATE_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792613903803, // Date.now() captured once for this entry.
    introducedIn: "2026.10.21.5",
    title: "Siege effects only play when a siege structure helps",
    why: "The purple bombardment and blue-violet siege beams kept showing up in battles that no finished siege structure was helping, including for players who had never built one.",
    changes: [
      "The purple bombardment and the blue-violet lance that drops onto a battle tile now play only when the attacker has a finished Siege Battery, Siege Tower or Dread Tower in range, on land they still hold",
      "Siege Towers and Dread Towers only beam battles their owner is fighting within siege range, instead of whichever battle started last anywhere on the map, and each tower's beam fades out on its own",
      "Siege structures that are still being built or taken down no longer fire"
    ]
  }
];
