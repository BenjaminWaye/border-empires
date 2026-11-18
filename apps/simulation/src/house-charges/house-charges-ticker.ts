// House Charges upkeep (docs/house-charges-plan.md), run from the simulation
// service's 1s ticker through runtime-side-tickers.ts and throttled to
// HOUSE_CHARGES_TICK_MIN_INTERVAL_MS. Each run:
//   - deals charges to every House (human or AI) that has landed (owns an
//     AFC) and has none yet;
//   - re-evaluates each House's kept charges and records when each one last
//     became complete (`completeSince`) and its current size, so the crowning
//     can read the outcome straight from player state.
// All state lives on DomainPlayer.houseCharges and is snapshotted with the
// player; the geometry is derived per tile map (house-charges-world.ts).
// Cost per run: a tile scan only while some House is still waiting for a
// deal, one more (shared by every House) when a kept Writ of Correction needs
// the map's AFCs, plus each kept charge's evaluation (bounded by the target's size or
// the House's own garrisoned land for a Charter).
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { HOUSE_CHARGES_KEPT, encodeChargeArt, getWorldSeed, keptHouseCharges, type HouseCharge, type HouseChargePoint } from "@border-empires/shared";
import { dealHouseCharges, offeredTargetKeys } from "./house-charge-dealing.js";
import { houseChargeStanding } from "./house-charge-held.js";
import { houseChargesWorldFor } from "./house-charges-world.js";
import type { DockRouteDefinition } from "../dock-network/dock-network.js";

export const HOUSE_CHARGES_TICK_MIN_INTERVAL_MS = 15_000;
/** Dealing needs a full tile scan for landing sites, so it runs at most this often. */
export const HOUSE_CHARGES_DEAL_MIN_INTERVAL_MS = 60_000;
const BARBARIAN_PLAYER_ID = "barbarian-1";

export type HouseChargesTickerDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly players: () => ReadonlyMap<string, DomainPlayer>;
  /** Worldgen dock routes: a Charter road may cross the sea along them (house-charge-held.ts). */
  readonly docks?: () => readonly DockRouteDefinition[];
  /** Runs after every pass, with the players whose charges were dealt, completed or lost on it. */
  readonly onPassComplete?: (changedPlayerIds: readonly string[], nowMs: number) => void;
};

export type HouseChargesTicker = {
  /** No-op until HOUSE_CHARGES_TICK_MIN_INTERVAL_MS has passed since the last run. */
  readonly tick: (nowMs: number) => void;
  /** Runs now regardless of the throttle (tests, and a final pass before crowning). */
  readonly runNow: (nowMs: number) => void;
};

/** Every AFC tile, scanned on first use and then reused (one pass over the map at most). */
export const afcTileScan = (tiles: ReadonlyMap<string, DomainTileState>): (() => readonly DomainTileState[]) => {
  let scanned: DomainTileState[] | undefined;
  return () => {
    if (!scanned) {
      scanned = [];
      for (const tile of tiles.values()) if (tile.afc) scanned.push(tile);
    }
    return scanned;
  };
};

/** Each landed House's landing site: its first AFC (one it landed preferred). */
export const landingSitesByPlayer = (tiles: ReadonlyMap<string, DomainTileState>): Map<string, HouseChargePoint> => {
  const sites = new Map<string, HouseChargePoint & { landed: boolean }>();
  for (const tile of tiles.values()) {
    const ownerId = tile.afc?.ownerId;
    if (!ownerId || tile.ownerId !== ownerId) continue;
    const landed = tile.afc?.landedAt !== undefined;
    const existing = sites.get(ownerId);
    if (!existing || (landed && !existing.landed)) sites.set(ownerId, { x: tile.x, y: tile.y, landed });
  }
  return new Map([...sites].map(([playerId, site]) => [playerId, { x: site.x, y: site.y }]));
};

/** Deals waiting Houses and refreshes every House's held state. Returns the players whose charges changed. */
export const runHouseChargesPass = (
  tiles: ReadonlyMap<string, DomainTileState>,
  players: ReadonlyMap<string, DomainPlayer>,
  nowMs: number,
  options: { readonly deal: boolean; readonly docks?: readonly DockRouteDefinition[] } = { deal: true }
): string[] => {
  const world = houseChargesWorldFor(tiles, options.docks);
  const changed = new Set<string>();
  const waiting = [...players.values()].filter((player) => player.id !== BARBARIAN_PLAYER_ID && !player.houseCharges);
  if (options.deal && waiting.length > 0) {
    const holderCount = new Map<string, number>();
    for (const player of players.values()) {
      for (const key of offeredTargetKeys(player.houseCharges)) holderCount.set(key, (holderCount.get(key) ?? 0) + 1);
    }
    const sites = landingSitesByPlayer(tiles);
    const worldSeed = getWorldSeed();
    for (const player of waiting.sort((a, b) => a.id.localeCompare(b.id))) {
      const home = sites.get(player.id);
      if (!home) continue;
      // A landing with no qualifying target gets an empty deal, so it is not retried every pass.
      const rivalLandings = [...sites].filter(([playerId]) => playerId !== player.id).map(([playerId, site]) => ({ playerId, name: players.get(playerId)?.name ?? playerId, x: site.x, y: site.y }));
      const rivalLandingSites = rivalLandings.map(({ x, y }) => ({ x, y }));
      const dealt = dealHouseCharges({ world, tiles, playerId: player.id, home, worldSeed, holders: (key) => holderCount.get(key) ?? 0, now: nowMs, rivalLandingSites, rivalLandings }) ??
        { dealtAt: nowMs, offered: [], keptIds: [] };
      // AI Houses never name islands (NAME_ISLAND), so they keep charges they can complete over a Survey Claim.
      if (player.isAi) dealt.keptIds = aiKeptIds(dealt.offered);
      player.houseCharges = dealt;
      for (const key of offeredTargetKeys(dealt)) holderCount.set(key, (holderCount.get(key) ?? 0) + 1);
      changed.add(player.id);
    }
  }
  // One AFC scan per pass, and only when some kept Writ of Correction needs it.
  const afcTiles = afcTileScan(tiles);
  for (const player of players.values()) {
    if (refreshPlayerHouseCharges(player, tiles, players, nowMs, afcTiles)) changed.add(player.id);
  }
  return [...changed];
};

const aiKeptIds = (offered: readonly HouseCharge[]): string[] =>
  [...offered.filter((charge) => charge.kind !== "SURVEY"), ...offered.filter((charge) => charge.kind === "SURVEY")]
    .slice(0, HOUSE_CHARGES_KEPT)
    .map((charge) => charge.id);

/** Re-evaluates one House's kept charges. Returns whether any charge became complete or stopped being complete. */
export const refreshPlayerHouseCharges = (
  player: DomainPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  players: ReadonlyMap<string, DomainPlayer>,
  nowMs: number,
  afcTiles: () => readonly DomainTileState[] = afcTileScan(tiles)
): boolean => {
  const state = player.houseCharges;
  if (!state) return false;
  const world = houseChargesWorldFor(tiles);
  const completeSince: Record<string, number> = {};
  const sizes: Record<string, number> = {};
  for (const charge of keptHouseCharges(state)) {
    const standing = houseChargeStanding(charge, { world, tiles, players, playerId: player.id, afcTiles });
    sizes[charge.id] = standing.size;
    if (standing.complete) completeSince[charge.id] = state.completeSince?.[charge.id] ?? nowMs;
    // Art follows what was last held complete, so a card shows the road or area the House actually held.
    const art = standing.complete && standing.shape ? encodeChargeArt(standing.shape, world.width, world.height) : undefined;
    if (art) state.art = { ...state.art, [charge.id]: art };
  }
  if (state.art) {
    for (const id of Object.keys(state.art)) if (!state.keptIds.includes(id)) delete state.art[id];
    if (Object.keys(state.art).length === 0) delete state.art;
  }
  const changed = JSON.stringify(state.completeSince ?? {}) !== JSON.stringify(completeSince);
  // A kept charge that was complete and no longer is: remember when, for the House's private loss warning.
  const lostAt: Record<string, number> = {};
  for (const charge of keptHouseCharges(state)) {
    if (completeSince[charge.id] !== undefined) continue;
    const since = state.completeSince?.[charge.id] !== undefined ? nowMs : state.lostAt?.[charge.id];
    if (since !== undefined) lostAt[charge.id] = since;
  }
  if (Object.keys(lostAt).length > 0) state.lostAt = lostAt;
  else delete state.lostAt;
  if (Object.keys(completeSince).length > 0) state.completeSince = completeSince;
  else delete state.completeSince;
  state.sizes = sizes;
  return changed;
};

export const createHouseChargesTicker = (deps: HouseChargesTickerDeps): HouseChargesTicker => {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let lastDealAt = Number.NEGATIVE_INFINITY;
  const runNow = (nowMs: number): void => {
    lastRunAt = nowMs;
    const deal = nowMs - lastDealAt >= HOUSE_CHARGES_DEAL_MIN_INTERVAL_MS;
    if (deal) lastDealAt = nowMs;
    const docks = deps.docks?.();
    const changed = runHouseChargesPass(deps.tiles(), deps.players(), nowMs, { deal, ...(docks ? { docks } : {}) });
    deps.onPassComplete?.(changed, nowMs);
  };
  return {
    tick: (nowMs) => {
      if (nowMs - lastRunAt < HOUSE_CHARGES_TICK_MIN_INTERVAL_MS) return;
      runNow(nowMs);
    },
    runNow
  };
};
