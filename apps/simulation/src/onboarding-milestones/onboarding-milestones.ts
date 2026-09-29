// Detects two onboarding milestones for human players and reports each to
// the gateway once, as a server-to-server ONBOARDING_MILESTONE player
// message (the gateway records it in its player-funnel store and never
// relays it to a client):
//
//   TEN_TILES      the player owns >= ONBOARDING_TEN_TILES_THRESHOLD tiles
//   FIRST_CONTACT  one of the player's tiles borders (4-neighbour) a tile
//                  owned by another empire — human or AI, never barbarian-*
//
// Driven by the tile-flip hook in runtime-lock-resolution rather than a
// timer: every flip re-checks the new owner (and, for contact, the owners
// bordering the flipped tile). The re-check scans the player's whole
// territory, not just the flipped tile, so tiles gained without a flip
// (auto-fill, spawn) are caught on the player's next claim. Scans are
// throttled per player and stop entirely once both milestones are reported.
//
// State is two bounded sets of player ids (<= player count) plus a throttle
// map of the same size; nothing here goes into snapshots. After a restart the
// sets are empty, so a milestone may be re-reported once — the gateway store
// is first-write-wins, which makes that harmless.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { ONBOARDING_MILESTONE_MESSAGE_TYPE, type OnboardingMilestonePayload, type SimulationEvent } from "@border-empires/sim-protocol";

import { simulationTileKey } from "../seed-state/seed-state.js";

export const ONBOARDING_TEN_TILES_THRESHOLD = 10;
export const ONBOARDING_SCAN_THROTTLE_MS = 30_000;

export type OnboardingMilestoneDeps = {
  now: () => number;
  players: () => ReadonlyMap<string, DomainPlayer>;
  tiles: () => ReadonlyMap<string, DomainTileState>;
  territoryTileKeys: (playerId: string) => ReadonlySet<string>;
  emitEvent: (event: SimulationEvent) => void;
};

export type OnboardingTileFlip = { x: number; y: number; toOwner: string | undefined };

export type OnboardingMilestoneTracker = {
  observeTileFlip: (flip: OnboardingTileFlip) => void;
  gauge: () => { tenTilesReported: number; contactReported: number; scans: number };
};

const NEIGHBOUR_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

const isBarbarianId = (playerId: string): boolean => playerId.startsWith("barbarian-");

export const createOnboardingMilestoneTracker = (deps: OnboardingMilestoneDeps): OnboardingMilestoneTracker => {
  const tenTilesReported = new Set<string>();
  const contactReported = new Set<string>();
  const lastScanAtByPlayer = new Map<string, number>();
  let scans = 0;

  // barbarian-1 is isAi:false, so "human" must exclude barbarian ids explicitly.
  const isHuman = (playerId: string): boolean => {
    const player = deps.players().get(playerId);
    return Boolean(player) && !player!.isAi && !isBarbarianId(playerId);
  };

  const isOtherEmpire = (ownerId: string | undefined, playerId: string): ownerId is string =>
    Boolean(ownerId) && ownerId !== playerId && !isBarbarianId(ownerId!);

  const neighbourOwners = (x: number, y: number): Array<string | undefined> => {
    const tiles = deps.tiles();
    return NEIGHBOUR_OFFSETS.map(([dx, dy]) => tiles.get(simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)))?.ownerId);
  };

  const emit = (playerId: string, payload: OnboardingMilestonePayload): void => {
    deps.emitEvent({
      eventType: "PLAYER_MESSAGE",
      commandId: `onboarding-milestone:${payload.kind}:${playerId}:${payload.at}`,
      playerId,
      messageType: ONBOARDING_MILESTONE_MESSAGE_TYPE,
      payloadJson: JSON.stringify(payload)
    });
  };

  const reportContact = (playerId: string, withPlayerId: string, at: number): void => {
    if (contactReported.has(playerId) || !isHuman(playerId)) return;
    contactReported.add(playerId);
    emit(playerId, { type: ONBOARDING_MILESTONE_MESSAGE_TYPE, kind: "FIRST_CONTACT", at, withPlayerId, withIsAi: deps.players().get(withPlayerId)?.isAi ?? false });
  };

  const findContact = (playerId: string): string | undefined => {
    const tiles = deps.tiles();
    for (const key of deps.territoryTileKeys(playerId)) {
      const tile = tiles.get(key);
      if (!tile) continue;
      const other = neighbourOwners(tile.x, tile.y).find((ownerId) => isOtherEmpire(ownerId, playerId));
      if (other) return other;
    }
    return undefined;
  };

  const scanPlayer = (playerId: string, at: number): void => {
    if (tenTilesReported.has(playerId) && contactReported.has(playerId)) return;
    if (!isHuman(playerId)) return;
    const lastScanAt = lastScanAtByPlayer.get(playerId);
    if (lastScanAt !== undefined && at - lastScanAt < ONBOARDING_SCAN_THROTTLE_MS) return;
    lastScanAtByPlayer.set(playerId, at);
    scans += 1;
    const ownedTiles = deps.territoryTileKeys(playerId).size;
    if (!tenTilesReported.has(playerId) && ownedTiles >= ONBOARDING_TEN_TILES_THRESHOLD) {
      tenTilesReported.add(playerId);
      emit(playerId, { type: ONBOARDING_MILESTONE_MESSAGE_TYPE, kind: "TEN_TILES", at, ownedTiles });
    }
    if (!contactReported.has(playerId)) {
      const other = findContact(playerId);
      if (other) {
        reportContact(playerId, other, at);
        reportContact(other, playerId, at);
      }
    }
  };

  return {
    observeTileFlip: (flip) => {
      const at = deps.now();
      const newOwner = flip.toOwner;
      // Unthrottled fast path: the flipped tile itself now borders someone.
      if (newOwner && !isBarbarianId(newOwner)) {
        const other = neighbourOwners(flip.x, flip.y).find((ownerId) => isOtherEmpire(ownerId, newOwner));
        if (other) {
          reportContact(newOwner, other, at);
          reportContact(other, newOwner, at);
        }
        scanPlayer(newOwner, at);
      }
    },
    gauge: () => ({ tenTilesReported: tenTilesReported.size, contactReported: contactReported.size, scans })
  };
};
