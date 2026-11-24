import type { SimulationTileWireDelta } from "./runtime-types.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";

export class CommandDeltaBuffer {
  private deltas: SimulationTileWireDelta[] | null = null;
  // Redeploys marked on absorbed batches. Carried onto the merged batch, or a knock-out resolved in combat would
  // lose its marker and a restart would forget the redeploy (DomainPlayer.redeploys). Reset with the deltas.
  private redeployPlayerIds: string[] = [];

  begin(): void {
    this.deltas = [];
    this.redeployPlayerIds = [];
  }

  absorb(event: SimulationEvent): boolean {
    if (this.deltas === null) return false;
    if (event.eventType !== "TILE_DELTA_BATCH") return false;
    this.deltas.push(...(event.tileDeltas as SimulationTileWireDelta[]));
    if (event.redeployPlayerIds) this.redeployPlayerIds.push(...event.redeployPlayerIds);
    return true;
  }

  flush(
    commandId: string,
    playerId: string,
    emit: (event: SimulationEvent) => void,
  ): void {
    const batch = this.deltas;
    const redeployPlayerIds = this.redeployPlayerIds;
    this.deltas = null;
    this.redeployPlayerIds = [];
    if (!batch || batch.length === 0) return;
    emit({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId,
      ...(redeployPlayerIds.length > 0 ? { redeployPlayerIds } : {}),
      tileDeltas: batch,
    });
  }
}
