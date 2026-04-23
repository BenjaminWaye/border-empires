#!/usr/bin/env node

const DEFAULTS = {
  url: "wss://border-empires-gateway-staging.fly.dev/ws?channel=control",
  attempts: 10,
  timeoutMs: 8_000,
  intervalMs: 250,
  tokenPrefix: "staging-probe",
  minSuccessRate: 1
};

const usage = () => {
  console.log(`Usage: node scripts/staging-login-latency-probe.mjs [options]

Options:
  --url <wss-url>                 WebSocket URL (default: ${DEFAULTS.url})
  --attempts <n>                  Number of auth attempts (default: ${DEFAULTS.attempts})
  --timeout-ms <ms>               Per-attempt timeout (default: ${DEFAULTS.timeoutMs})
  --interval-ms <ms>              Delay between attempts (default: ${DEFAULTS.intervalMs})
  --token-prefix <prefix>         Auth token prefix (default: ${DEFAULTS.tokenPrefix})
  --max-p95-ms <ms>               Exit non-zero if success p95 exceeds this threshold
  --min-success-rate <0..1>       Exit non-zero if success rate drops below threshold (default: ${DEFAULTS.minSuccessRate})
  --json                          Emit JSON summary
  --help                          Show help
`);
};

const parseNumberArg = (name, raw, fallback) => {
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${name}: ${raw}`);
  }
  return parsed;
};

const parseArgs = (argv) => {
  const options = {
    ...DEFAULTS,
    maxP95Ms: undefined,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (arg === "--url") {
      if (!value) throw new Error("--url requires a value");
      options.url = value;
      index += 1;
      continue;
    }
    if (arg === "--attempts") {
      options.attempts = Math.max(1, Math.floor(parseNumberArg("--attempts", value, options.attempts)));
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = Math.max(250, Math.floor(parseNumberArg("--timeout-ms", value, options.timeoutMs)));
      index += 1;
      continue;
    }
    if (arg === "--interval-ms") {
      options.intervalMs = Math.max(0, Math.floor(parseNumberArg("--interval-ms", value, options.intervalMs)));
      index += 1;
      continue;
    }
    if (arg === "--token-prefix") {
      if (!value) throw new Error("--token-prefix requires a value");
      options.tokenPrefix = value;
      index += 1;
      continue;
    }
    if (arg === "--max-p95-ms") {
      options.maxP95Ms = Math.max(1, parseNumberArg("--max-p95-ms", value, 0));
      index += 1;
      continue;
    }
    if (arg === "--min-success-rate") {
      options.minSuccessRate = Math.max(0, Math.min(1, parseNumberArg("--min-success-rate", value, options.minSuccessRate)));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
};

const percentile = (values, q) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx] ?? 0;
};

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runAttempt = async ({ url, timeoutMs, tokenPrefix }, attemptIndex) => {
  const token = `${tokenPrefix}-${Date.now()}-${attemptIndex}`;
  const socket = new WebSocket(url);
  let completed = false;
  let authSentAt = 0;
  return new Promise((resolve) => {
    const finalize = (result) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeoutId);
      try {
        socket.close();
      } catch {
        // no-op
      }
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      finalize({ ok: false, latencyMs: timeoutMs, reason: "TIMEOUT" });
    }, timeoutMs);

    socket.addEventListener("open", () => {
      authSentAt = Date.now();
      socket.send(JSON.stringify({ type: "AUTH", token }));
    });

    socket.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const latencyMs = authSentAt > 0 ? Date.now() - authSentAt : timeoutMs;
      if (payload?.type === "INIT") {
        finalize({ ok: true, latencyMs, reason: "INIT" });
        return;
      }
      if (payload?.type === "ERROR") {
        finalize({ ok: false, latencyMs, reason: String(payload.code || "ERROR") });
      }
    });

    socket.addEventListener("error", () => {
      finalize({ ok: false, latencyMs: authSentAt > 0 ? Date.now() - authSentAt : timeoutMs, reason: "SOCKET_ERROR" });
    });

    socket.addEventListener("close", () => {
      if (!completed) {
        finalize({ ok: false, latencyMs: authSentAt > 0 ? Date.now() - authSentAt : timeoutMs, reason: "SOCKET_CLOSED" });
      }
    });
  });
};

const formatMs = (value) => `${Math.round(value)}ms`;

const main = async () => {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[probe] ${error instanceof Error ? error.message : String(error)}`);
    usage();
    process.exit(2);
  }

  const attempts = [];
  for (let index = 0; index < options.attempts; index += 1) {
    const attemptResult = await runAttempt(options, index + 1);
    attempts.push(attemptResult);
    if (!options.json) {
      const status = attemptResult.ok ? "ok" : "fail";
      console.log(
        `[attempt ${index + 1}/${options.attempts}] ${status} latency=${formatMs(attemptResult.latencyMs)} reason=${attemptResult.reason}`
      );
    }
    if (index + 1 < options.attempts && options.intervalMs > 0) {
      await sleep(options.intervalMs);
    }
  }

  const successLatencies = attempts.filter((attempt) => attempt.ok).map((attempt) => attempt.latencyMs);
  const successRate = attempts.length > 0 ? successLatencies.length / attempts.length : 0;
  const summary = {
    url: options.url,
    attempts: attempts.length,
    successes: successLatencies.length,
    failures: attempts.length - successLatencies.length,
    successRate,
    latencyMs: {
      min: successLatencies.length > 0 ? Math.min(...successLatencies) : 0,
      p50: percentile(successLatencies, 0.5),
      p95: percentile(successLatencies, 0.95),
      p99: percentile(successLatencies, 0.99),
      max: successLatencies.length > 0 ? Math.max(...successLatencies) : 0
    },
    failureReasons: attempts.filter((attempt) => !attempt.ok).map((attempt) => attempt.reason)
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("");
    console.log(`[summary] url=${summary.url}`);
    console.log(
      `[summary] attempts=${summary.attempts} success=${summary.successes} fail=${summary.failures} successRate=${(summary.successRate * 100).toFixed(1)}%`
    );
    if (summary.successes > 0) {
      console.log(
        `[summary] latency min=${formatMs(summary.latencyMs.min)} p50=${formatMs(summary.latencyMs.p50)} p95=${formatMs(summary.latencyMs.p95)} p99=${formatMs(summary.latencyMs.p99)} max=${formatMs(summary.latencyMs.max)}`
      );
    }
    if (summary.failures > 0) {
      console.log(`[summary] failureReasons=${summary.failureReasons.join(",")}`);
    }
  }

  if (summary.successRate < options.minSuccessRate) {
    console.error(
      `[probe] failed: success rate ${(summary.successRate * 100).toFixed(1)}% below threshold ${(options.minSuccessRate * 100).toFixed(1)}%`
    );
    process.exit(1);
  }

  if (typeof options.maxP95Ms === "number" && summary.successes > 0 && summary.latencyMs.p95 > options.maxP95Ms) {
    console.error(`[probe] failed: p95 ${formatMs(summary.latencyMs.p95)} exceeds threshold ${formatMs(options.maxP95Ms)}`);
    process.exit(1);
  }

  if (summary.successes === 0) {
    console.error("[probe] failed: no successful login attempts");
    process.exit(1);
  }
};

void main();
