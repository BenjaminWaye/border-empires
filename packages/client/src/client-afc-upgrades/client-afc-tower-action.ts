import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { formatCooldownShort } from "../client-app-runtime-utils.js";

export function afcTowerSuppressionAction(tile: Tile, options: { installed: boolean; hostile: boolean; inRange: boolean; cooldownMs: number }): TileActionDef[] {
  if (!options.installed || !options.hostile || tile.fogged || tile.observatory?.status !== "active") return [];
  const reason = !options.inRange ? "Need an active Aether Tower in range" : options.cooldownMs > 0 ? `Tower out of shots · next in ${formatCooldownShort(options.cooldownMs)}` : "";
  return [{ id: "suppress_aether_tower", label: "Suppress Aether Tower", detail: "Disable casting, shielding and flag detection for 5 minutes. Uses 1 of your tower's shots; Aegis Domes block it.", disabled: Boolean(reason), ...(reason ? { disabledReason: reason } : {}) }];
}

/** Shared tile-targeted actions; suppression uses its own command and preserves ordinary Purge effects. */
export function dispatchTileAetherAction(actionId: string, selected: Pick<Tile, "x" | "y">, state: Pick<ClientState, "aetherLanceFxQueue">, send: (payload: unknown) => boolean): void {
  if (actionId === "forced_ancillarification") send({ type: "FORCED_ANCILLARIFICATION", x: selected.x, y: selected.y });
  if (actionId === "suppress_aether_tower") send({ type: "SUPPRESS_AETHER_TOWER", x: selected.x, y: selected.y });
  if (actionId === "aether_lance" && send({ type: "AETHER_LANCE", x: selected.x, y: selected.y })) state.aetherLanceFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
}
