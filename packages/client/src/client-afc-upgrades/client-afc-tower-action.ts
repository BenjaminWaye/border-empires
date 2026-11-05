import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { formatCooldownShort } from "../client-app-runtime-utils.js";

interface AfcTowerActionOptions { installed: boolean; hostile: boolean; inRange: boolean; cooldownMs: number; hijackInstalled?: boolean; hijackReadyInMs?: number; now?: number }

/** Whether a hostile tower is open to Resonance Hijack: out of shots, or suppressed by Counterphase, and not already being taken. */
export const towerOpenToHijack = (tower: Tile["observatory"], now: number): boolean =>
  tower?.status === "active" && !((tower.hijack?.endsAt ?? 0) > now) && ((tower.suppressedUntil ?? 0) > now || (tower.cooldownUntil ?? 0) > now);

/** Counterphase Emitter (AFC Oracle IV) and Resonance Hijack (AFC Oracle V) rows for a hostile Aether Tower. */
export function afcTowerSuppressionAction(tile: Tile, options: AfcTowerActionOptions): TileActionDef[] {
  if (!options.hostile || tile.fogged || tile.observatory?.status !== "active") return [];
  const rows: TileActionDef[] = [];
  const towerReason = !options.inRange ? "Need an active Aether Tower in range" : options.cooldownMs > 0 ? `Tower out of shots · next in ${formatCooldownShort(options.cooldownMs)}` : "";
  if (options.installed) rows.push({ id: "suppress_aether_tower", label: "Suppress Aether Tower", detail: "Disable casting and shielding for 5 minutes, opening it to Resonance Hijack. Uses 1 of your tower's shots; Aegis Domes block it.", disabled: Boolean(towerReason), ...(towerReason ? { disabledReason: towerReason } : {}) });
  if (options.hijackInstalled) {
    const now = options.now ?? Date.now();
    const ready = Math.max(0, options.hijackReadyInMs ?? 0);
    const reason = ready > 0 ? `Hijack recharges in ${formatCooldownShort(ready)}` : !towerOpenToHijack(tile.observatory, now) ? "Only towers out of shots, or suppressed, can be hijacked" : towerReason;
    rows.push({ id: "hijack_aether_tower", label: "Hijack Aether Tower", detail: "Take the tower over in 10 minutes. Your casting tower is revealed to its owner until then; if they take, suppress or unpower it, the hijack fails. Uses 1 shot; once per 24h.", disabled: Boolean(reason), ...(reason ? { disabledReason: reason } : {}) });
  }
  return rows;
}

/** Shared tile-targeted actions; suppression uses its own command and preserves ordinary Purge effects. */
export function dispatchTileAetherAction(actionId: string, selected: Pick<Tile, "x" | "y">, state: Pick<ClientState, "aetherLanceFxQueue">, send: (payload: unknown) => boolean): void {
  if (actionId === "forced_ancillarification") send({ type: "FORCED_ANCILLARIFICATION", x: selected.x, y: selected.y });
  if (actionId === "ship_salvage_to_court") send({ type: "SHIP_SALVAGE_TO_COURT", x: selected.x, y: selected.y });
  if (actionId === "suppress_aether_tower") send({ type: "SUPPRESS_AETHER_TOWER", x: selected.x, y: selected.y });
  if (actionId === "hijack_aether_tower") send({ type: "HIJACK_AETHER_TOWER", x: selected.x, y: selected.y });
  if (actionId === "aether_lance" && send({ type: "AETHER_LANCE", x: selected.x, y: selected.y })) state.aetherLanceFxQueue.push({ x: selected.x, y: selected.y, queuedAt: Date.now() });
}
