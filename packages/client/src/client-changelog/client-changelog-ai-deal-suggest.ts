import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_DEAL_SUGGEST_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792446771133, // Date.now() captured once for this release.
    introducedIn: "2026.10.19.5",
    title: "Suggest deal, and AIs that are losing will talk peace",
    why: "An AI losing a war to you said it wanted the war over but refused every truce, and AI alliances were always answered with \"can't weigh up an alliance right now\".",
    changes: [
      "The diplomacy screen has a Suggest deal button that fills in the best terms the AI would accept: what it would pay you for peace, or the least coin (then Shards) it wants from you",
      "An AI losing a war now talks peace even when it is Furious with you",
      "The screen says why an AI thinks it is losing, such as how many more tiles it has lost to you than it has taken",
      "During a war, a war tally shows the tiles each side has taken, as the AI counts them (recent captures count most)",
      "AIs can now judge alliances again; a refused alliance gives the real reason, such as fighting within the last day, instead of \"try again shortly\""
    ]
  }
];
