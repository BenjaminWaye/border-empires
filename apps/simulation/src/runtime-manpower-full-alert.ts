/**
 * "Manpower full" email alert — docs/replenishment-update-plan.md D1/D11.
 *
 * The main "come back" signal for a player who's away: once manpower hits
 * its cap, further regen is wasted, so this is the moment worth emailing
 * about. Deliberately NOT a per-spend deadline queue (manpower is spent from
 * ~15 different call sites across build/attack/settle/muster/expand, and
 * every spend would have to reschedule a per-player deadline to stay
 * accurate) — instead this is a bounded, coarse periodic sweep over players,
 * the same shape runtime-maintenance-ticks.ts's tickTileShedding already
 * uses for its own O(players) per-cycle work. Per-player cost here is a
 * handful of arithmetic reads (no BFS, no per-tile work), so unlike
 * tickTileShedding this doesn't need async/per-player yields — a live
 * population makes this cheap even run back-to-back on the sim's main
 * thread, which is why it's safe to call synchronously from a plain
 * setInterval in simulation-service.ts.
 *
 * alertedPlayerIds is in-memory only, never snapshotted or persisted: it's
 * just "who is currently sitting at cap and has already been told" —
 * self-pruning (an entry is removed the instant that player's manpower
 * drops back below cap) and bounded by the count of players currently at
 * cap, itself bounded by live player count. A service restart can cause at
 * most one duplicate email for a player already sitting at cap and offline
 * at restart time — a deliberately accepted, low-cost tradeoff against
 * threading a persisted flag through hydration/snapshot code for this.
 */
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { RuntimePlayer } from "./runtime-types.js";

export type ManpowerFullAlertTickContext = {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  playerManpowerCap: (player: RuntimePlayer) => number;
  playerManpowerRegenPerMinute: (player: RuntimePlayer) => number;
  effectiveManpowerAt: (player: RuntimePlayer, nowMs: number) => number;
  isPlayerSubscribed: (playerId: string) => boolean;
  emitEvent: (event: SimulationEvent) => void;
  alertedPlayerIds: Set<string>;
};

/** Returns the number of alerts emitted this tick — zero forever means the sweep never fires under real load, same "counter on every guard" convention as the decay queue. */
export const tickManpowerFullAlerts = (ctx: ManpowerFullAlertTickContext): number => {
  let alerted = 0;
  for (const player of ctx.players.values()) {
    if (player.isAi) continue;
    if (player.id.startsWith("barbarian-")) continue;
    const cap = ctx.playerManpowerCap(player);
    if (!(cap > 0)) continue;
    const current = ctx.effectiveManpowerAt(player, ctx.nowMs);
    if (current < cap) {
      // Dropped below cap since we last looked — re-arm so their next fill
      // gets its own alert.
      ctx.alertedPlayerIds.delete(player.id);
      continue;
    }
    if (ctx.alertedPlayerIds.has(player.id)) continue; // already told about this fill
    const regen = ctx.playerManpowerRegenPerMinute(player);
    // Titanium Levy's regen freeze (regen <= 0): they aren't actively
    // "filling up" right now, so don't alert yet — recheck next tick in case
    // the freeze lifts while they're still sitting at cap.
    if (regen <= 0) continue;
    // Online players see their own manpower bar fill up live — the email is
    // for players who aren't watching it happen.
    if (ctx.isPlayerSubscribed(player.id)) continue;
    ctx.alertedPlayerIds.add(player.id);
    ctx.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId: `manpower-full-alert:${player.id}:${ctx.nowMs}`,
      playerId: player.id,
      messageType: "MANPOWER_FULL_ALERT",
      payloadJson: JSON.stringify({ type: "MANPOWER_FULL_ALERT" })
    });
    alerted += 1;
  }
  return alerted;
};
