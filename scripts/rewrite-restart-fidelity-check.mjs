import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { credentials, loadPackageDefinition } from "../apps/realtime-gateway/node_modules/@grpc/grpc-js/build/src/index.js";
import { loadSync } from "../apps/realtime-gateway/node_modules/@grpc/proto-loader/build/src/index.js";
import { SIMULATION_PROTO_PATH } from "../packages/sim-protocol/src/index.js";

const simulationAddress = process.env.SIMULATION_ADDRESS ?? "127.0.0.1:50051";
const playerId = process.env.PLAYER_ID ?? "player-1";
const gatewayHealthUrl = process.env.GATEWAY_HEALTH_URL ?? "http://127.0.0.1:3101/health";
const restartCommand = process.env.RESTART_COMMAND ?? "pnpm rewrite:restart:20ai";
const healthTimeoutMs = Math.max(10_000, Number(process.env.HEALTH_TIMEOUT_MS ?? "120000"));
const healthPollMs = Math.max(250, Number(process.env.HEALTH_POLL_MS ?? "1000"));
const interestingTileLimit = Math.max(10, Number(process.env.INTERESTING_TILE_LIMIT ?? "40"));

const packageDefinition = loadSync(fileURLToPath(SIMULATION_PROTO_PATH), {
  keepCase: true,
  longs: Number,
  defaults: true,
  enums: String,
  oneofs: false
});

const proto = loadPackageDefinition(packageDefinition);

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const createSimulationClient = () =>
  new proto.border_empires.simulation.SimulationService(
    simulationAddress,
    credentials.createInsecure()
  );

const subscribePlayer = (targetPlayerId) =>
  new Promise((resolve, reject) => {
    const client = createSimulationClient();
    client.SubscribePlayer({ player_id: targetPlayerId, subscription_json: "{}" }, (error, response) => {
      client.close();
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });

const parseJson = (value) => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const normalizeTile = (tile) => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain ?? null,
  resource: tile.resource ?? null,
  dockId: tile.dock_id ?? null,
  ownerId: tile.owner_id ?? null,
  ownershipState: tile.ownership_state ?? null,
  town: parseJson(tile.town_json) ?? null,
  townType: tile.town_type ?? null,
  townName: tile.town_name ?? null,
  townPopulationTier: tile.town_population_tier ?? null,
  fort: parseJson(tile.fort_json) ?? null,
  observatory: parseJson(tile.observatory_json) ?? null,
  siegeOutpost: parseJson(tile.siege_outpost_json) ?? null,
  economicStructure: parseJson(tile.economic_structure_json) ?? null,
  sabotage: parseJson(tile.sabotage_json) ?? null,
  shardSite: parseJson(tile.shard_site_json) ?? null,
  yield: tile.yield ?? null,
  yieldRate: tile.yieldRate ?? null,
  yieldCap: tile.yieldCap ?? null
});

const normalizePlayer = (response) => parseJson(response.player_json) ?? null;
const normalizeWorldStatus = (response) => parseJson(response.world_status_json) ?? null;

const tileKey = (tile) => `${tile.x},${tile.y}`;

const isInterestingTile = (tile) =>
  tile.ownerId === playerId ||
  tile.resource !== null ||
  tile.town !== null ||
  tile.dockId !== null ||
  tile.shardSite !== null ||
  tile.economicStructure !== null ||
  tile.fort !== null ||
  tile.observatory !== null ||
  tile.siegeOutpost !== null;

const canonicalize = (value) => JSON.stringify(value, Object.keys(value).sort());

const pickInterestingTiles = (tiles) =>
  tiles
    .filter(isInterestingTile)
    .sort((left, right) => {
      const leftPriority = Number(left.ownerId === playerId) + Number(left.town !== null) + Number(left.resource !== null);
      const rightPriority = Number(right.ownerId === playerId) + Number(right.town !== null) + Number(right.resource !== null);
      return rightPriority - leftPriority || left.x - right.x || left.y - right.y;
    })
    .slice(0, interestingTileLimit);

const diffObjects = (before, after) => {
  const beforeKeys = before ? Object.keys(before) : [];
  const afterKeys = after ? Object.keys(after) : [];
  const allKeys = [...new Set([...beforeKeys, ...afterKeys])].sort();
  return allKeys
    .filter((key) => canonicalize(before?.[key] ?? null) !== canonicalize(after?.[key] ?? null))
    .map((key) => ({
      key,
      before: before?.[key] ?? null,
      after: after?.[key] ?? null
    }));
};

const diffTiles = (beforeTiles, afterTiles) => {
  const beforeByKey = new Map(beforeTiles.map((tile) => [tileKey(tile), tile]));
  const afterByKey = new Map(afterTiles.map((tile) => [tileKey(tile), tile]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort((left, right) => {
    const [leftX, leftY] = left.split(",").map(Number);
    const [rightX, rightY] = right.split(",").map(Number);
    return leftX - rightX || leftY - rightY;
  });
  return keys
    .map((key) => {
      const before = beforeByKey.get(key) ?? null;
      const after = afterByKey.get(key) ?? null;
      if (canonicalize(before) === canonicalize(after)) return undefined;
      return { tileKey: key, before, after };
    })
    .filter(Boolean);
};

const fetchSnapshot = async () => {
  const response = await subscribePlayer(playerId);
  const tiles = response.tiles.map(normalizeTile);
  return {
    player: normalizePlayer(response),
    worldStatus: normalizeWorldStatus(response),
    tiles,
    interestingTiles: pickInterestingTiles(tiles)
  };
};

const waitForHealthyGateway = async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < healthTimeoutMs) {
    try {
      const response = await fetch(gatewayHealthUrl);
      if (response.ok) {
        const json = await response.json();
        if (json?.ok === true && json?.simulation?.connected === true) return json;
      }
    } catch {
      // retry until timeout
    }
    await sleep(healthPollMs);
  }
  throw new Error(`gateway did not report healthy simulation within ${healthTimeoutMs}ms`);
};

const runRestart = () =>
  new Promise((resolve, reject) => {
    const child = spawn(restartCommand, {
      cwd: process.cwd(),
      env: process.env,
      shell: true,
      detached: true,
      stdio: "ignore"
    });
    child.on("error", reject);
    child.unref();
    resolve();
  });

const projectInterestingAfterTiles = (interestingTiles, afterTiles) => {
  const afterByKey = new Map(afterTiles.map((tile) => [tileKey(tile), tile]));
  return interestingTiles.map((tile) => afterByKey.get(tileKey(tile)) ?? null);
};

const main = async () => {
  const before = await fetchSnapshot();
  console.log(
    JSON.stringify(
      {
        type: "restart-fidelity-before",
        playerId,
        tileCount: before.tiles.length,
        interestingTileCount: before.interestingTiles.length
      },
      null,
      2
    )
  );

  await runRestart();
  const health = await waitForHealthyGateway();
  const after = await fetchSnapshot();
  const afterInterestingTiles = projectInterestingAfterTiles(before.interestingTiles, after.tiles);

  const playerDiffs = diffObjects(before.player, after.player);
  const worldStatusDiffs = diffObjects(before.worldStatus, after.worldStatus);
  const tileDiffs = diffTiles(before.interestingTiles, afterInterestingTiles.filter(Boolean));

  const summary = {
    type: "restart-fidelity-summary",
    playerId,
    gatewayHealth: health,
    before: {
      tileCount: before.tiles.length,
      interestingTileCount: before.interestingTiles.length
    },
    after: {
      tileCount: after.tiles.length,
      interestingTileCount: afterInterestingTiles.filter(Boolean).length
    },
    playerDiffCount: playerDiffs.length,
    worldStatusDiffCount: worldStatusDiffs.length,
    tileDiffCount: tileDiffs.length,
    playerDiffs,
    worldStatusDiffs,
    tileDiffs
  };

  console.log(JSON.stringify(summary, null, 2));
  if (playerDiffs.length > 0 || tileDiffs.length > 0) {
    process.exitCode = 1;
  }
};

await main();
