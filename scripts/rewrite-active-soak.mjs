import { spawn } from "node:child_process";

import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const databaseUrl = process.env.DATABASE_URL ?? process.env.SIMULATION_DATABASE_URL ?? process.env.GATEWAY_DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL or SIMULATION_DATABASE_URL or GATEWAY_DATABASE_URL is required");
  process.exit(1);
}

const durationMs = Math.max(10_000, Number(process.env.ACTIVE_SOAK_DURATION_MS ?? "600000"));
const sampleEveryMs = Math.max(2_000, Number(process.env.ACTIVE_SOAK_SAMPLE_MS ?? "10000"));
const minUniqueAiPlayers = Math.max(1, Number(process.env.ACTIVE_SOAK_MIN_UNIQUE_AI ?? "10"));
const minAiSettleCommands = Math.max(1, Number(process.env.ACTIVE_SOAK_MIN_SETTLES ?? "10"));
const minAiFrontierCommands = Math.max(1, Number(process.env.ACTIVE_SOAK_MIN_FRONTIER ?? "25"));
const minAiTotalCommands = Math.max(1, Number(process.env.ACTIVE_SOAK_MIN_TOTAL_AI_COMMANDS ?? "50"));

const pool = new pg.Pool({ connectionString: databaseUrl });

const queryMetrics = async (startedAt) => {
  const result = await pool.query(
    `
      SELECT
        COUNT(DISTINCT command_id)::int AS total_commands,
        COUNT(DISTINCT player_id)::int AS unique_ai_players,
        COUNT(
          DISTINCT CASE
            WHEN event_type = 'TILE_DELTA_BATCH'
              AND NOT EXISTS (
                SELECT 1
                FROM world_events accepted
                WHERE accepted.command_id = world_events.command_id
                  AND accepted.event_type = 'COMMAND_ACCEPTED'
              )
            THEN command_id
          END
        )::int AS settle_commands,
        COUNT(
          DISTINCT CASE
            WHEN event_type = 'COMMAND_ACCEPTED'
              AND COALESCE(event_payload->>'actionType', '') IN ('EXPAND', 'ATTACK', 'BREAKTHROUGH_ATTACK')
            THEN command_id
          END
        )::int AS frontier_commands
      FROM world_events
      WHERE player_id LIKE 'ai-%'
        AND created_at >= $1
    `,
    [startedAt]
  );

  const topPlayersResult = await pool.query(
    `
      SELECT player_id, COUNT(DISTINCT command_id)::int AS command_count
      FROM world_events
      WHERE player_id LIKE 'ai-%'
        AND created_at >= $1
      GROUP BY player_id
      ORDER BY command_count DESC, player_id ASC
      LIMIT 10
    `,
    [startedAt]
  );

  return {
    totalCommands: result.rows[0]?.total_commands ?? 0,
    uniqueAiPlayers: result.rows[0]?.unique_ai_players ?? 0,
    settleCommands: result.rows[0]?.settle_commands ?? 0,
    frontierCommands: result.rows[0]?.frontier_commands ?? 0,
    topPlayers: topPlayersResult.rows.map((row) => ({
      playerId: row.player_id,
      commandCount: row.command_count
    }))
  };
};

const runHumanSoak = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/rewrite-local-soak.mjs"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WS_URL: wsUrl
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`rewrite-local-soak exited with code ${code}\n${stdout}\n${stderr}`));
    });
  });

const main = async () => {
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;
  const humanSoakPromise = runHumanSoak();
  let latestMetrics = await queryMetrics(startedAt);

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, sampleEveryMs));
    latestMetrics = await queryMetrics(startedAt);
    console.log(
      JSON.stringify(
        {
          type: "active-soak-sample",
          elapsedMs: Date.now() - startedAt,
          ...latestMetrics
        },
        null,
        2
      )
    );
  }

  const humanSoak = await humanSoakPromise;
  latestMetrics = await queryMetrics(startedAt);
  const pass =
    latestMetrics.uniqueAiPlayers >= minUniqueAiPlayers &&
    latestMetrics.settleCommands >= minAiSettleCommands &&
    latestMetrics.frontierCommands >= minAiFrontierCommands &&
    latestMetrics.totalCommands >= minAiTotalCommands;

  const summary = {
    type: "active-soak-summary",
    wsUrl,
    durationMs,
    humanSoakCompleted: Boolean(humanSoak),
    thresholds: {
      minUniqueAiPlayers,
      minAiSettleCommands,
      minAiFrontierCommands,
      minAiTotalCommands
    },
    metrics: latestMetrics,
    pass
  };

  console.log(JSON.stringify(summary, null, 2));
  await pool.end();

  if (!pass) {
    process.exitCode = 1;
  }
};

await main();
