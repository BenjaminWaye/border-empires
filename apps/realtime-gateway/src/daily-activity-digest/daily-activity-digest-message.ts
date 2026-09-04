// Formats the same Slack digest text that scripts/daily-activity-digest.mjs
// used to build from a fetched GET /api/activity response, but from the
// in-process ActivityApiResponse directly (see daily-activity-digest-poll.ts)
// -- no HTTP round trip, so no risk of hitting the API's own 503s.
import type { ActivityApiResponse } from "@border-empires/game-domain";

export const buildDailyActivityDigestSlackText = (data: ActivityApiResponse): string => {
  const lines: string[] = [];
  lines.push(`*Border Empires — Today's Story* (${new Date(data.generatedAt).toDateString()})`);

  if (data.dailyStory.length > 0) {
    lines.push("");
    for (const event of data.dailyStory) {
      lines.push(`*${event.headline}.* ${event.text}`);
    }
  } else {
    lines.push("");
    lines.push("Quiet day — nothing worth reporting.");
  }

  if (data.powerScore.length > 0) {
    const top3 = [...data.powerScore].sort((a, b) => a.rank - b.rank).slice(0, 3);
    lines.push("");
    lines.push("*:trophy: Power score leaders:*");
    for (const p of top3) {
      lines.push(`${p.rank}. ${p.name} — ${p.score}`);
    }
  }

  return lines.join("\n");
};
