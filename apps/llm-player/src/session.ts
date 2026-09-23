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
import { sleep } from "./sleep.js";
import { summarizeTurn } from "./state-summary.js";
import { buildTileIndex, buildViewport, defaultCamera, type CameraPosition } from "./viewport.js";

// Gives the gateway a moment to push the TILE_DELTA_BATCH/PLAYER_UPDATE that
// follow an accepted command before the next turn reads currentState() --
// mirrors scripts/rewrite-local-soak.mjs's settleAfterAcceptedMs, which
// exists for the same reason (ACTION_ACCEPTED itself carries no updated
// gold/manpower/tile state, only origin/target/resolvesAt).
const SETTLE_AFTER_ACCEPTED_MS = 300;

const describeResult = (
  action: Awaited<ReturnType<typeof decideNextAction>>["action"],
  result: { outcome: "accepted" } | { outcome: "error"; code: string; message: string } | undefined
): string => {
  if (action === "wait") return "waited";
  if (action.type === "PAN_CAMERA") return "";
  const target = "toX" in action ? `(${action.fromX},${action.fromY})->(${action.toX},${action.toY})` : `(${action.x},${action.y})`;
  if (action.type === "BUILD_ECONOMIC_STRUCTURE") {
    if (result?.outcome === "error") return `BUILD_ECONOMIC_STRUCTURE(RELAY_BEACON) ${target}: failed to send (${result.code})`;
    return `BUILD_ECONOMIC_STRUCTURE(RELAY_BEACON) ${target}: sent (no ack for this command)`;
  }
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
  const initial = game.currentState();
  console.log(`Connected as ${initial.playerName || initial.playerId} (${initial.tiles.length} known tiles).`);

  let camera: CameraPosition = defaultCamera(initial);

  try {
    for (let turn = 1; turn <= config.turnsPerSession; turn += 1) {
      const state = game.currentState();
      const index = buildTileIndex(state);
      const status = {
        playerId: state.playerId,
        playerName: state.playerName,
        gold: state.gold,
        manpower: state.manpower,
        manpowerCap: state.manpowerCap,
        manpowerRegenPerMinute: state.manpowerRegenPerMinute
      };
      const context = summarizeTurn(index, status, camera, state.eventLog);
      const { action } = await decideNextAction(anthropic, context);

      let outcomeLine: string;
      let result: { outcome: "accepted" } | { outcome: "error"; code: string; message: string } | undefined;
      if (action !== "wait" && action.type === "PAN_CAMERA") {
        // Fog of war means panning outside every known tile is a dead end --
        // nothing will ever appear there, since this bot never scouts, only
        // acts on tiles the gateway has already revealed. Ignore rather than
        // strand the rest of the session with an empty viewport.
        const candidate = { x: action.x, y: action.y };
        if (buildViewport(index, candidate).length > 0) {
          camera = candidate;
          outcomeLine = `panned camera to (${candidate.x},${candidate.y})`;
        } else {
          outcomeLine = `ignored pan to (${candidate.x},${candidate.y}) -- no known tiles there`;
        }
      } else if (action !== "wait" && action.type === "BUILD_ECONOMIC_STRUCTURE") {
        // No ACTION_ACCEPTED/ERROR ack path for this command (see
        // BuildRelayBeaconAction's doc comment in game-socket.ts) -- only
        // report that it was sent, not whether the server accepted it.
        try {
          await game.buildRelayBeacon(action);
        } catch (error) {
          result = {
            outcome: "error",
            code: game.isClosed() ? "DISCONNECTED" : "SEND_FAILED",
            message: error instanceof Error ? error.message : String(error)
          };
        }
        outcomeLine = describeResult(action, result);
      } else if (action !== "wait") {
        try {
          result = await game.sendAction(action);
          if (result.outcome === "accepted") await sleep(SETTLE_AFTER_ACCEPTED_MS);
        } catch (error) {
          result = {
            outcome: "error",
            code: game.isClosed() ? "DISCONNECTED" : "TIMEOUT",
            message: error instanceof Error ? error.message : String(error)
          };
        }
        outcomeLine = describeResult(action, result);
      } else {
        outcomeLine = describeResult(action, result);
      }

      const line = `turn ${turn}/${config.turnsPerSession}: ${outcomeLine}`;
      console.log(line);
      log.push(line);

      // No point attempting the remaining turns against a connection that's
      // confirmed gone -- each would otherwise fail immediately anyway (see
      // GameSession.sendAction), but stopping here reports it once instead
      // of once per remaining turn.
      if (game.isClosed()) {
        const stoppedLine = `turn ${turn}/${config.turnsPerSession}: connection lost, ending session early`;
        console.log(stoppedLine);
        log.push(stoppedLine);
        break;
      }

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
