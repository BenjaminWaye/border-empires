#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const stagingFlyApps = [
  {
    app: "border-empires-combined-staging",
    configPath: "fly.combined.staging.toml"
  }
];

export const parseTomlEnvSection = (source) => {
  const env = {};
  const lines = source.split(/\r?\n/);
  let inEnvSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line === "[env]") {
      inEnvSection = true;
      continue;
    }

    if (!inEnvSection) continue;
    if (line.startsWith("[")) break;

    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    env[key] = value.startsWith('"') && value.endsWith('"') ? JSON.parse(value) : value;
  }

  return env;
};

export const diffExpectedEnv = (expectedEnv, actualEnv) =>
  Object.entries(expectedEnv)
    .filter(([, expectedValue]) => expectedValue !== undefined)
    .flatMap(([key, expectedValue]) => {
      const actualValue = actualEnv[key];
      if (actualValue === expectedValue) return [];
      return [{ key, expectedValue, actualValue }];
    });

const runFlyJson = (args) => {
  const output = execFileSync("fly", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(output);
};

const loadExpectedEnv = (configPath) => parseTomlEnvSection(readFileSync(resolve(root, configPath), "utf8"));

const inspectApp = ({ app, configPath }) => {
  const expectedEnv = loadExpectedEnv(configPath);
  const machines = runFlyJson(["machine", "list", "-a", app, "--json"]);

  if (!Array.isArray(machines) || machines.length === 0) {
    throw new Error(`No Fly machines found for ${app}. Deploy the app once, then rerun this check.`);
  }

  return {
    app,
    configPath,
    machines: machines.map((machine) => {
      const actualEnv = machine?.config?.env ?? {};
      return {
        id: machine.id,
        state: machine.state,
        mismatches: diffExpectedEnv(expectedEnv, actualEnv)
      };
    })
  };
};

const printHumanReport = (reports) => {
  const mismatchedMachines = reports.flatMap((report) =>
    report.machines
      .filter((machine) => machine.mismatches.length > 0)
      .map((machine) => ({ app: report.app, configPath: report.configPath, ...machine }))
  );

  if (mismatchedMachines.length === 0) {
    console.log("Staging Fly env matches checked-in staging TOMLs.");
    for (const report of reports) {
      for (const machine of report.machines) {
        console.log(`- ${report.app} ${machine.id} (${machine.state}) ok`);
      }
    }
    return;
  }

  console.error("Staging Fly env drift detected.");
  for (const machine of mismatchedMachines) {
    console.error(`- ${machine.app} ${machine.id} (${machine.state}) diverges from ${machine.configPath}`);
    for (const mismatch of machine.mismatches) {
      const actualValue = mismatch.actualValue ?? "<missing>";
      console.error(`  - ${mismatch.key}: expected=${mismatch.expectedValue} actual=${actualValue}`);
    }
  }

  console.error("Tip: stale Fly secrets can override the checked-in staging config.");
};

const main = () => {
  const jsonMode = process.argv.includes("--json");
  const reports = stagingFlyApps.map(inspectApp);
  const hasDrift = reports.some((report) => report.machines.some((machine) => machine.mismatches.length > 0));

  if (jsonMode) {
    console.log(JSON.stringify({ ok: !hasDrift, checkedAt: new Date().toISOString(), reports }, null, 2));
  } else {
    printHumanReport(reports);
  }

  if (hasDrift) process.exitCode = 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
