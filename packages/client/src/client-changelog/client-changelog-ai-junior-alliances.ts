import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_JUNIOR_ALLIANCES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793743423377, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "AI empires ally with bigger Houses",
    why: "An AI only allied with you if it was the bigger empire, so anyone larger than an AI could never win one over, and the gift screen promised an alliance that would then be refused.",
    changes: [
      "AI empires now join an alliance they wouldn't lead, as long as the combined alliance holds under 40% of the world's land, counted the way Diplomatic Dominance counts it",
      "Once an alliance they don't lead reaches 45% of the land, they give 24h notice and leave, so they still won't hand you Diplomatic Dominance",
      "The gift screen no longer says a gift is enough for an alliance when the AI would refuse for another reason, and says that reason instead"
    ]
  }
];
