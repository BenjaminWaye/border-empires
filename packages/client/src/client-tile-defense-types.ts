import type { ObservatorySiphonMode } from "@border-empires/shared";

export type ClientTileObservatory = {
  readonly supportAnchor?: { x: number; y: number } | null;
  ownerId: string;
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number; startedAt?: number; pausedAt?: number;
  suppressedUntil?: number; cooldownUntil?: number; siphon?: ObservatorySiphonMode;
};
export type ClientTileSiegeBattery = {
  ownerId: string;
  status: "under_construction" | "active" | "removing";
  variant?: "SIEGE_BATTERY" | "SIEGE_TOWER" | "DREAD_TOWER";
  completesAt?: number; startedAt?: number; pausedAt?: number;
};
