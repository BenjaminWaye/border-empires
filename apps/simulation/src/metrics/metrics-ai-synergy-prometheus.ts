import type { EconomicSynergySummary } from "../ai/build/economic-synergy-diagnostics.js";
import { formatMetricValue } from "./metrics-format.js";

// sim_ai_player_synergy{player_id,kind}: one gauge per AI player per
// EconomicSynergySummary field (docs/ai-economic-synergy-plan.md). Bounded by
// the fixed AI roster × 9 kinds. Answers "are the AIs building Clearing
// Houses / Trade Nexuses / Neural Works, and stacking Manufactories?".
export const renderAiSynergyPrometheusLines = (byPlayer: Record<string, EconomicSynergySummary>): string[] => {
  const lines = ["# TYPE sim_ai_player_synergy gauge"];
  for (const [playerId, summary] of Object.entries(byPlayer)) {
    for (const [kind, value] of Object.entries(summary)) {
      lines.push(`sim_ai_player_synergy{player_id=\"${playerId}\",kind=\"${kind}\"} ${formatMetricValue(value)}`);
    }
  }
  return lines;
};
