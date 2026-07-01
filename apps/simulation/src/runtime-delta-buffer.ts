import type { SimulationTileWireDelta } from "./runtime-types.js";
import type { SimulationEvent } from "@border-empires/sim-protocol";

export class CommandDeltaBuffer {
  private deltas: SimulationTileWireDelta[] | null = null;

  begin(): void {
    this.deltas = [];
  }

  absorb(event: SimulationEvent): boolean {
    if (this.deltas === null) return false;
    if (event.eventType !== "TILE_DELTA_BATCH") return false;
    this.deltas.push(...(event.tileDeltas as SimulationTileWireDelta[]));
    return true;
  }

  flush(
    commandId: string,
    playerId: string,
    emit: (event: SimulationEvent) => void,
  ): void {
    const batch = this.deltas;
    this.deltas = null;
    if (!batch || batch.length === 0) return;
    emit({
      eventType: "TILE_DELTA_BATCH",
      commandId,
      playerId,
      tileDeltas: batch,
    });
  }
}
