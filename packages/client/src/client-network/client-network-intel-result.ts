import { isRevealEmpireStatsView, surveySweepPingsFromPayload } from "./client-network-codec.js";
import { logSurveySweepReceived } from "../survey-sweep-debug-log/survey-sweep-debug-log.js";
import { revealEmpireStatsFeedText } from "../client-empire-intel/client-empire-intel.js";
import type { ClientState } from "../client-state/client-state.js";
import { pushFeedEntry } from "../client-alerts/client-alerts.js";
import { surveySweepFeedEntry } from "./client-network-survey-sweep-feed.js";
import type { FeedType, FeedSeverity } from "../client-types.js";

export function handleIntelResult(msg: Record<string, unknown>, state: ClientState, pushFeed: (text: string, type?: FeedType, severity?: FeedSeverity) => void, renderHud: () => void): boolean {
    if (msg.type === "REVEAL_EMPIRE_STATS_RESULT") {
      const stats = isRevealEmpireStatsView(msg.stats) ? { ...msg.stats, playerName: state.playerNames.get(msg.stats.playerId) ?? msg.stats.playerName } : undefined;
      if (stats) {
        state.revealedEmpireStatsByPlayer.set(stats.playerId, stats);
        state.activeRevealEmpireStatsPopup = stats;
        pushFeed(revealEmpireStatsFeedText(stats), "combat", "success");
      }
      renderHud();
      return true;
    }
    if (msg.type === "SURVEY_SWEEP_RESULT") {
      const nowMs = Date.now();
      const pings = surveySweepPingsFromPayload(msg.pings);
      state.surveySweepPings.push(...pings.map((ping) => ({ ...ping, createdAt: nowMs, expiresAt: nowMs + 12_000 })));
      logSurveySweepReceived(msg.pings, pings, state.surveySweepPings.length);
      pushFeedEntry(state, surveySweepFeedEntry(pings, nowMs));
      renderHud();
      return true;
    }

  return false;
}
