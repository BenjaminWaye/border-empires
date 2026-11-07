import { afcReplacementCost } from "@border-empires/shared";
import type { DomainPlayer } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";
import { validReplacementSite, type AfcRecoverySiteContext } from "../afc-owned-site/afc-recovery.js";

export const AFC_RECOVERY_SITE_SCAN_LIMIT = 256;
type AiAfcRecoveryContext = AfcRecoverySiteContext & Pick<RuntimeStructureCommandContext, "summaryForPlayer" | "afcGlobalLosses">;

/** Only runs for the selected AFC-less, funded AI; candidates come from its owned index. */
export function planAiAfcReplacement(context: AiAfcRecoveryContext, player: DomainPlayer): CommandEnvelope | undefined {
  const summary = context.summaryForPlayer?.(player.id);
  if (!player.isAi || player.id.startsWith("barbarian-") || !summary || summary.controlledAfcCount > 0 || player.afcRecovery?.pending || player.points < afcReplacementCost(context.afcGlobalLosses?.() ?? 0)) return undefined;
  let best: { x: number; y: number; score: number } | undefined;
  const cursor = summary.afcRecoverySiteCursor ??= summary.territoryTileKeys.values();
  for (let visited = 0; visited < AFC_RECOVERY_SITE_SCAN_LIMIT; visited++) {
    const next = cursor.next();
    if (next.done) { delete summary.afcRecoverySiteCursor; break; }
    const key = next.value;
    const tile = context.tiles.get(key);
    if (!tile || !validReplacementSite(context, player.id, tile.x, tile.y)) continue;
    let score = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (context.tiles.get(`${tile.x + dx},${tile.y + dy}`)?.ownerId === player.id) score++;
    if (!best || score > best.score) best = { x: tile.x, y: tile.y, score };
    if (score === 25) break;
  }
  if (!best) return undefined;
  delete summary.afcRecoverySiteCursor;
  return { commandId: `ai-runtime:afc-recovery:${player.id}:${context.now()}`, playerId: player.id, type: "BUILD_AFC", payloadJson: JSON.stringify({ x: best.x, y: best.y }), clientSeq: 0, sessionId: "ai-runtime:afc-recovery", issuedAt: context.now() };
}
