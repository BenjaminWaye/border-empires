// Builds the ISLAND_NAMES label list and advances every chosen name's
// held / contested / fading state (shared island-names.ts). Claim upkeep
// mutates the namers' persisted `islandNames`: a fading claim gets its
// `fadingSince` stamped (or cleared on recovery) and a claim whose fade ran
// out, or whose island no longer exists, is dropped.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { evaluateIslandClaim, type IslandLabel } from "@border-empires/shared";
import { currentIslandClaims, islandStandingFor, releaseIslandClaims, type IslandNamesWorld } from "./island-names-world.js";

const roundTo = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

export const buildIslandLabels = (
  world: IslandNamesWorld,
  tiles: ReadonlyMap<string, DomainTileState>,
  players: ReadonlyMap<string, DomainPlayer>,
  nowMs: number
): IslandLabel[] => {
  const claims = currentIslandClaims(players);
  for (const islandId of [...claims.keys()]) {
    if (world.registry.byId.has(islandId)) continue;
    releaseIslandClaims(players, islandId);
    claims.delete(islandId);
  }
  const labels: IslandLabel[] = [];
  for (const island of world.registry.islands) {
    const { geometry } = island;
    const base = {
      id: island.id,
      x: roundTo(geometry.x, 2),
      y: roundTo(geometry.y, 2),
      angle: roundTo(geometry.angle, 3),
      span: roundTo(geometry.span, 1),
      thickness: roundTo(geometry.thickness, 1)
    };
    const entry = claims.get(island.id);
    if (!entry) {
      labels.push({ ...base, name: world.defaultNameFor(island), status: "default" });
      continue;
    }
    const { playerId, claim } = entry;
    const evaluation = evaluateIslandClaim(claim, islandStandingFor(island, tiles, playerId), nowMs);
    if (evaluation.kind === "reverted") {
      releaseIslandClaims(players, island.id);
      labels.push({ ...base, name: world.defaultNameFor(island), status: "default" });
      continue;
    }
    if (evaluation.kind === "fading") {
      claim.fadingSince = evaluation.fadingSince;
      labels.push({ ...base, name: claim.name, status: "fading", namerId: playerId, revertsAt: evaluation.revertsAt });
      continue;
    }
    delete claim.fadingSince;
    labels.push({ ...base, name: claim.name, status: evaluation.kind, namerId: playerId });
  }
  return labels;
};

/** Cheap change signature: geometry and default names never change within a runtime, so only named islands matter. */
export const islandLabelsSignature = (labels: readonly IslandLabel[]): string =>
  labels
    .filter((label) => label.status !== "default")
    .map((label) => `${label.id}|${label.name}|${label.status}|${label.namerId ?? ""}|${label.revertsAt ?? ""}`)
    .join(";");
