import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import type { FeedEntry } from "../client-types.js";

export type WorldEngineStrikeHistoryRecord = {
  strikeId: string;
  occurredAt: number;
  casterName: string;
  targetX: number;
  targetY: number;
  townName: string;
  populationTier: string;
  populationLost: number;
  targetOwnerName: string;
};

// Backfills up to the last 12h of World Engine strikes for a client that
// connects/reconnects after missing the live broadcast (gateway-app.ts's
// __broadcast__ PLAYER_MESSAGE fan-out). Public/unauthenticated — see
// world-engine-strike-routes.ts.
export const fetchWorldEngineStrikeHistory = async (wsUrl: string): Promise<WorldEngineStrikeHistoryRecord[]> => {
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/world-events/world-engine-strikes`);
    if (!response.ok) return [];
    const body = (await response.json()) as { ok?: boolean; strikes?: WorldEngineStrikeHistoryRecord[] };
    return body.ok && Array.isArray(body.strikes) ? body.strikes : [];
  } catch {
    return [];
  }
};

// Renders a persisted strike record as an Activity Feed card, reusing the
// existing feedHtml() renderer for the "World Events" history section
// (client-hud.ts) instead of building bespoke history UI.
export const worldEngineStrikeRecordToFeedEntry = (record: WorldEngineStrikeHistoryRecord): FeedEntry => ({
  text: `${record.casterName} struck ${record.targetOwnerName}'s ${record.townName || "city"} with the World Engine — ${Math.round(record.populationLost).toLocaleString()} lives lost.`,
  type: "combat",
  severity: "error",
  at: record.occurredAt,
  focusX: record.targetX,
  focusY: record.targetY,
  actionLabel: "Center"
});
