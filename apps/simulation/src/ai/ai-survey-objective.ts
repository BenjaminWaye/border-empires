import { WORLD_HEIGHT, WORLD_WIDTH, chebyshevWithWrap } from "@border-empires/shared";

export type AiSurveyObjective = { x: number; y: number; expiresAt: number };

/** Survey pings are legitimate information even beyond normal vision. Keep
 * one useful objective per existing player record, with a ten-minute TTL. */
export function readAiSurveyObjective(payloadJson: string, now: number): AiSurveyObjective | undefined {
  try {
    const payload = JSON.parse(payloadJson) as { center?: { x?: unknown; y?: unknown }; pings?: unknown };
    if (!Array.isArray(payload.pings) || typeof payload.center?.x !== "number" || typeof payload.center.y !== "number") return undefined;
    let best: { x: number; y: number; distance: number } | undefined;
    for (const ping of payload.pings) {
      if (!ping || typeof ping !== "object" || !("x" in ping) || !("y" in ping) || !("kind" in ping)) continue;
      if (!Number.isInteger(ping.x) || !Number.isInteger(ping.y) || typeof ping.x !== "number" || typeof ping.y !== "number" || ping.x < 0 || ping.x >= WORLD_WIDTH || ping.y < 0 || ping.y >= WORLD_HEIGHT) continue;
      if (ping.kind !== "town" && ping.kind !== "resource") continue;
      const distance = chebyshevWithWrap(payload.center.x, payload.center.y, ping.x, ping.y);
      if (!best || distance < best.distance) best = { x: ping.x, y: ping.y, distance };
    }
    return best ? { x: best.x, y: best.y, expiresAt: now + 600_000 } : undefined;
  } catch { return undefined; }
}
