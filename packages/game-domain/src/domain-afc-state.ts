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
  /** Set whenever an existing AFC gets a new owner via capturedAfc (combat capture or reclaiming an abandoned tile); the client skips the landing drop for it. */
  capturedAt?: number | undefined;
  /** The House that landed or built this AFC; kept through captures. Read through afcFoundedBy (@border-empires/shared). */
  foundedBy?: string | undefined;
  modules?: string[] | undefined;
  houseModules?: string[] | undefined;
  /** Captured copies only: module tech id -> the House whose copy it was when this AFC was taken (capturedAfc). */
  capturedModuleHouses?: Record<string, string> | undefined;
  incomingModules?: Array<{ techId: string; arrivesAt: number }> | undefined;
};
