// One bounded play session: sign in, connect, make a handful of decisions,
// write a short journal entry, post to Discord, disconnect. Meant to be
// invoked on a schedule (twice a day, like a normal player logging in) via
// cron/launchd calling `pnpm dev` -- see README.md.
import type Anthropic from "@anthropic-ai/sdk";
import { selectAutoSettlementTargets } from "./auto-settle.js";
import type { BotConfig } from "./config.js";
import { postToDiscord } from "./discord-notify.js";
import { signInBotAccount } from "./firebase-auth.js";
import { GameSession, type GameInitState } from "./game-socket.js";
import { createAnthropicClient, decideNextAction, writeSessionJournal } from "./llm-agent.js";
import { sleep } from "./sleep.js";
import { summarizeTurn } from "./state-summary.js";
import { buildTileIndex, buildViewport, defaultCamera, type CameraPosition, type TileIndex } from "./viewport.js";

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

const reportConnectionLost = (turn: number, totalTurns: number, log: string[]): void => {
  const line = `turn ${turn}/${totalTurns}: connection lost, ending session early`;
  console.log(line);
  log.push(line);
};

// Mirrors what the real browser client does automatically on every
// PLAYER_UPDATE (see auto-settle.ts's doc comment): fire ordinary SETTLE
// commands for whatever the server's autoSettlementQueue currently offers,
// budget-gated by manpower. Runs once at the top of every turn, independent
// of the LLM's one decided action -- a human player never "spends a turn"
// on these, so the bot shouldn't either. Returns true if anything was sent,
// so the caller knows whether it needs a fresh tile index/state before
// building this turn's LLM context.
const drainAutoSettlementQueue = async (
  game: GameSession,
  index: TileIndex,
  state: GameInitState,
  pendingTileKeys: Set<string>,
  log: string[]
): Promise<boolean> => {
  // A tile we sent a SETTLE for in an earlier turn resolves (SETTLE lands
  // as SETTLED, or the tile is lost) independently of this drain -- prune
  // it here once it's no longer FRONTIER so it isn't tracked as pending
  // forever if we never see its resolution any other way.
  for (const key of pendingTileKeys) {
    const tile = index.get(key);
    if (!tile || tile.ownershipState !== "FRONTIER") pendingTileKeys.delete(key);
  }

  const targets = selectAutoSettlementTargets(state.autoSettlementQueue, index, state.playerId, state.manpower, pendingTileKeys);
  let sentAny = false;
  for (const target of targets) {
    if (game.isClosed()) break;
    const key = `${target.x},${target.y}`;
    try {
      const result = await game.sendAction({ type: "SETTLE", x: target.x, y: target.y });
      sentAny = true;
      if (result.outcome === "accepted") pendingTileKeys.add(key);
      const line = `auto-settle (${target.x},${target.y}): ${result.outcome === "accepted" ? "accepted" : `rejected (${result.code})`}`;
      console.log(line);
      log.push(line);
      if (result.outcome === "accepted") await sleep(SETTLE_AFTER_ACCEPTED_MS);
    } catch (error) {
      // Doesn't necessarily mean the connection is gone -- sendAction also
      // rejects on a plain COMMAND_TIMEOUT_MS response timeout without
      // setting connectionError, so game.isClosed() isn't guaranteed true
      // here. Log it either way so a silent stall shows up in the session
      // log/Discord digest instead of vanishing.
      const line = `auto-settle (${target.x},${target.y}): failed to send (${error instanceof Error ? error.message : String(error)})`;
      console.log(line);
      log.push(line);
      break;
    }
  }
  return sentAny;
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
  const pendingAutoSettleTileKeys = new Set<string>();

  try {
    for (let turn = 1; turn <= config.turnsPerSession; turn += 1) {
      let state = game.currentState();
      let index = buildTileIndex(state);
      const sentAutoSettle = await drainAutoSettlementQueue(game, index, state, pendingAutoSettleTileKeys, log);
      if (game.isClosed()) {
        reportConnectionLost(turn, config.turnsPerSession, log);
        break;
      }
      if (sentAutoSettle) {
        state = game.currentState();
        index = buildTileIndex(state);
      }

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
        reportConnectionLost(turn, config.turnsPerSession, log);
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
