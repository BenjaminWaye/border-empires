import type { OwnershipChangeSample } from "../runtime/runtime-ownership-change-sample.js";

// capturedTownAftermath (runtime-capture-aftermath.ts) razes SETTLEMENT-tier
// towns on capture as routine population absorption — the town structure
// disappears, but it isn't a defensive loss worth paging ops about. The
// runtime's townLost signal stays true for this case (the tile genuinely
// lost its town), so the Slack "Town Lost" alert filters it separately.
export const isSettlementTierTownLoss = (previousTownPopulationTier: string | undefined): boolean =>
  previousTownPopulationTier === "SETTLEMENT";

// Prod and staging post to the same Slack webhook, so a bare alert gives no
// way to tell which environment fired it.
export const resolveEnvironmentLabel = (env: NodeJS.ProcessEnv): string =>
  env.NODE_ENV === "production" ? "prod" : env.NODE_ENV === "staging" ? "staging" : (env.FLY_APP_NAME ?? "unknown");

export type TownLostAlert = {
  message: string;
  logFields: Record<string, unknown>;
  skippedSettlementTier: boolean;
  slackBody: unknown;
};

export const buildTownLostAlert = (
  sample: OwnershipChangeSample,
  environmentLabel: string,
  slackLabel: string
): TownLostAlert => {
  const skippedSettlementTier = isSettlementTierTownLoss(sample.previousTownPopulationTier);
  const message = `[ownership_audit] (${environmentLabel}) TOWN LOST on tile ${sample.tileKey} (${sample.x},${sample.y}) — previous owner ${sample.previousOwnerId}`;
  return {
    message,
    skippedSettlementTier,
    logFields: {
      tileKey: sample.tileKey,
      x: sample.x,
      y: sample.y,
      previousOwnerId: sample.previousOwnerId,
      nextOwnerId: sample.nextOwnerId,
      commandId: sample.commandId,
      hadTown: sample.hadTown,
      environment: environmentLabel,
      previousTownPopulationTier: sample.previousTownPopulationTier,
      alertSkippedSettlementTier: skippedSettlementTier
    },
    slackBody: {
      text: `<!channel> *${slackLabel} (${environmentLabel}):* ${message}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `🏚️ Town Lost [${environmentLabel}]` } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Environment:* ${environmentLabel}` },
            { type: "mrkdwn", text: `*Tile:* ${sample.tileKey} (${sample.x},${sample.y})` },
            { type: "mrkdwn", text: `*Previous Owner:* ${sample.previousOwnerId}` },
            { type: "mrkdwn", text: `*Command:* \`${sample.commandId}\`` }
          ]
        }
      ]
    }
  };
};
