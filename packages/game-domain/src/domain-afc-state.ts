import type { Tile } from "@border-empires/shared";

export type DomainAfcState = {
  ownerId: string;
  status: NonNullable<Tile["afc"]>["status"];
  activatedAt?: number | undefined;
  modules?: string[] | undefined;
  houseModules?: string[] | undefined;
  incomingModules?: Array<{ techId: string; arrivesAt: number }> | undefined;
};
