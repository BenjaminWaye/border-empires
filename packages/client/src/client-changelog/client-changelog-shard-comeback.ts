import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SHARD_COMEBACK_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792792926334, // Date.now() captured once for this entry.
    introducedIn: "2026.10.23.1",
    title: "Shards are now a way back after a heavy defeat",
    why: "Coming back to find most of your land taken left you with an empty manpower pool and hours of waiting before you could fight back.",
    changes: [
      "Donate 1 Shard to the Court from the Manpower panel and it ships an Imperial delivery of ancillaries that refills your manpower to its cap at once (Shard Mobilization)",
      "The delivery never takes you above your cap, and it is unavailable while your Titanium Levy has regen frozen",
      "Shard rain now favours empires that recently lost a large share of their land: up to half of each rain's sites fall on their own territory, so they can collect them straight away",
      "The bigger your recent loss, the more likely a site lands on your land, and the effect fades over about a day as your empire settles at its new size"
    ]
  }
];
