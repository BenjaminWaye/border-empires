import { isRevealEmpireStatsView, surveySweepPingsFromPayload } from "./client-network-codec.js";
import { logSurveySweepReceived } from "../survey-sweep-debug-log/survey-sweep-debug-log.js";
import { revealEmpireStatsFeedText } from "../client-empire-intel/client-empire-intel.js";
import type { ClientState } from "../client-state/client-state.js";
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
      const resourceCount = pings.filter((ping) => ping.kind === "resource").length;
      const townCount = pings.filter((ping) => ping.kind === "town").length;
      pushFeed(`Survey Sweep found ${resourceCount} resource ${resourceCount === 1 ? "site" : "sites"} and ${townCount} ${townCount === 1 ? "town" : "towns"} outside current vision.`, "info", "success");
      renderHud();
      return true;
    }

  return false;
}
