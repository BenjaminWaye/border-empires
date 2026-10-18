import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { additiveEffectForPlayer, multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { fortWardRechargeAt } from "./afc-battle-effects.js";

/** Public fort facts for commitment controls and ward status; the resolver still checks live ownership/power. */
export function withAfcFortFacts(tile: DomainTileState, players: ReadonlyMap<string, DomainPlayer>): DomainTileState {
  if (!tile.fort) return tile;
  const owner = tile.ownerId ? players.get(tile.ownerId) : undefined;
  const attackCommitmentMult = owner ? multiplicativeEffectForPlayer(owner, "fortAttackerCommitmentMult") : 1;
  const wardEnabled = Boolean(owner && additiveEffectForPlayer(owner, "fortWardRechargeMs") > 0);
  const wardRechargesAt = fortWardRechargeAt(players, `${tile.x},${tile.y}`);
  if ((tile.fort.attackCommitmentMult ?? 1) === attackCommitmentMult && Boolean(tile.fort.wardEnabled) === wardEnabled && (tile.fort.wardRechargesAt ?? 0) === wardRechargesAt) return tile;
  return { ...tile, fort: { ...tile.fort, attackCommitmentMult, wardEnabled, wardRechargesAt } };
}
export function refreshAfcFortFacts(playerId: string, keys: Iterable<string>, tiles: ReadonlyMap<string, DomainTileState>, players: ReadonlyMap<string, DomainPlayer>, write: (key: string, tile: DomainTileState) => void): void {
  for (const key of keys) {
    const tile = tiles.get(key);
    if (tile?.fort && tile.ownerId === playerId) { const next = withAfcFortFacts(tile, players); if (next !== tile) write(key, next); }
  }
}
