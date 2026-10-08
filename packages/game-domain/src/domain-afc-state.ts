import type { Tile } from "@border-empires/shared";

export type DomainAfcState = {
  ownerId: string;
  status: NonNullable<Tile["afc"]>["status"];
  activatedAt?: number | undefined;
  /**
   * Set only when a spawn/respawn lands this AFC on fresh ground; a capture
   * strips it (capturedAfc). Marks the AFC whose 3x3 footprint is always its
   * owner's reach, see AFC_LANDING_GUARANTEED_REACH_RADIUS.
   */
  landedAt?: number | undefined;
  modules?: string[] | undefined;
  houseModules?: string[] | undefined;
  incomingModules?: Array<{ techId: string; arrivesAt: number }> | undefined;
};
