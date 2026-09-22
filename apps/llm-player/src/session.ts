// One bounded play session: sign in, connect, make a handful of decisions,
// write a short journal entry, post to Discord, disconnect. Meant to be
// invoked on a schedule (twice a day, like a normal player logging in) via
// cron/launchd calling `pnpm dev` -- see README.md.
import type Anthropic from "@anthropic-ai/sdk";
import type { BotConfig } from "./config.js";
import { postToDiscord } from "./discord-notify.js";
import { signInBotAccount } from "./firebase-auth.js";
import { GameSession } from "./game-socket.js";
import { createAnthropicClient, decideNextAction, writeSessionJournal } from "./llm-agent.js";
import { summarizeState } from "./state-summary.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const describeResult = (
  action: Awaited<ReturnType<typeof decideNextAction>>["action"],
  result: { outcome: "accepted" } | { outcome: "error"; code: string; message: string } | undefined
): string => {
  if (action === "wait") return "waited";
  const target = "toX" in action ? `(${action.fromX},${action.fromY})->(${action.toX},${action.toY})` : `(${action.x},${action.y})`;
  if (!result) return `${action.type} ${target}: no response`;
  return result.outcome === "accepted" ? `${action.type} ${target}: accepted` : `${action.type} ${target}: rejected (${result.code})`;
};

export const runSession = async (config: BotConfig): Promise<void> => {
  const anthropic: Anthropic = createAnthropicClient(config.anthropicApiKey);
  const log: string[] = [];

  console.log(`Signing in as ${config.botEmail}...`);
  const auth = await signInBotAccount(config.firebaseApiKey, config.botEmail, config.botPassword);

  console.log(`Connecting to ${config.gatewayWsUrl}...`);
  const game = await GameSession.connect(config.gatewayWsUrl, auth.idToken);
  console.log(`Connected as ${game.initState.playerName || game.initState.playerId} (${game.initState.tiles.length} known tiles).`);

  try {
    for (let turn = 1; turn <= config.turnsPerSession; turn += 1) {
      const summary = summarizeState(game.initState);
      const { action } = await decideNextAction(anthropic, summary);

      let result: { outcome: "accepted" } | { outcome: "error"; code: string; message: string } | undefined;
      if (action !== "wait") {
        try {
          result = await game.sendAction(action);
        } catch (error) {
          result = { outcome: "error", code: "TIMEOUT", message: error instanceof Error ? error.message : String(error) };
        }
      }

      const line = `turn ${turn}/${config.turnsPerSession}: ${describeResult(action, result)}`;
      console.log(line);
      log.push(line);

      if (turn < config.turnsPerSession) await sleep(config.turnIntervalMs);
    }
  } finally {
    game.close();
  }

  const journal = await writeSessionJournal(anthropic, log);
  console.log(`\nSession journal:\n${journal}`);

  if (config.discordWebhookUrl) {
    const message = [`**${config.botDisplayName} played a session** (${log.length} turns)`, "", ...log, "", `_${journal}_`].join("\n");
    await postToDiscord(config.discordWebhookUrl, message);
  }
};
