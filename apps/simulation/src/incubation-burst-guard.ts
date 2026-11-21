import type { DomainTileState } from "@border-empires/game-domain";

type BurstTown = NonNullable<DomainTileState["town"]>;

/**
 * The Incubation Engine population burst is paid at most once per owner per
 * town. Without this, demolishing and rebuilding the engine (0 Coin, 80
 * manpower) re-paid INCUBATION_ENGINE_INSTANT_POPULATION_BURST every cycle,
 * and removal never takes the population back. A Colonial Charter grant
 * (`colonialIncubationGrantedTo`, recorded before this guard existed) counts
 * as the same owner's burst. A new owner of a captured town earns its own.
 */
export const incubationBurstAlreadyGranted = (town: BurstTown, ownerId: string): boolean =>
  town.incubationBurstGrantedTo === ownerId || town.colonialIncubationGrantedTo === ownerId;
