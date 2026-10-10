import { readSeedWorldTemplate, type SimulationSeedProfile } from "../../../simulation/src/seed-state/seed-state.js";

// Build the gateway's seed-world fallback (see readSeedWorldTemplate) once at
// boot, before the server takes traffic and before the event-loop watchdog
// arms. Built lazily, the first login after every restart generated the whole
// season-20ai world on the gateway main thread -- 30-45s on staging, enough
// to fail the deploy's guest probe or get the process SIGKILLed.
export const warmGatewaySeedWorld = (
  profile: SimulationSeedProfile,
  log: (line: string) => void = (line) => console.log(line)
): number => {
  const startedAt = Date.now();
  readSeedWorldTemplate(profile);
  const durationMs = Date.now() - startedAt;
  log(JSON.stringify({ level: 30, time: Date.now(), msg: "gateway_seed_world_warmed", profile, durationMs }));
  return durationMs;
};
