import net from "node:net";

type ListenerWatchdogLogger = Partial<Pick<Console, "info" | "warn" | "error">>;

export type ListenerHealthSnapshot = {
  ok: boolean;
  bindHost: string;
  probeHost: string;
  port: number;
  probeIntervalMs: number;
  probeTimeoutMs: number;
  failureThreshold: number;
  consecutiveFailures: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
};

type ListenerWatchdogOptions = {
  bindHost: string;
  port: number;
  probeHost?: string;
  probeIntervalMs: number;
  probeTimeoutMs: number;
  failureThreshold: number;
  log?: ListenerWatchdogLogger;
  onUnhealthy?: (snapshot: ListenerHealthSnapshot) => void;
  probe?: (args: { host: string; port: number; timeoutMs: number }) => Promise<void>;
};

export const selfProbeHostForBindHost = (bindHost: string): string => {
  const normalized = bindHost.trim();
  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]") return "127.0.0.1";
  return normalized;
};

export const resolveProbeHost = (bindHost: string, probeHost?: string): string => {
  const normalizedProbeHost = probeHost?.trim();
  if (normalizedProbeHost) return normalizedProbeHost;
  return selfProbeHostForBindHost(bindHost);
};

export const probeTcpListener = ({ host, port, timeoutMs }: { host: string; port: number; timeoutMs: number }): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      callback();
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(resolve));
    socket.once("timeout", () => finish(() => reject(new Error(`listener probe timed out after ${timeoutMs}ms`))));
    socket.once("error", (error) => finish(() => reject(error)));
  });

export const createListenerWatchdog = (options: ListenerWatchdogOptions) => {
  const probeHost = resolveProbeHost(options.bindHost, options.probeHost);
  const failureThreshold = Math.max(1, options.failureThreshold);
  const snapshotState: ListenerHealthSnapshot = {
    ok: true,
    bindHost: options.bindHost,
    probeHost,
    port: options.port,
    probeIntervalMs: options.probeIntervalMs,
    probeTimeoutMs: options.probeTimeoutMs,
    failureThreshold,
    consecutiveFailures: 0,
    lastSuccessAt: Date.now()
  };
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let tripped = false;
  let probeInFlight = false;

  const emit = (level: keyof ListenerWatchdogLogger, message: string, payload: Record<string, unknown>): void => {
    const writer = options.log?.[level];
    if (typeof writer === "function") writer.call(options.log, payload, message);
  };

  const probe = options.probe ?? probeTcpListener;

  const runProbe = async (): Promise<void> => {
    if (stopped || probeInFlight) return;
    probeInFlight = true;
    try {
      await probe({ host: probeHost, port: options.port, timeoutMs: options.probeTimeoutMs });
      if (stopped) return;
      const recovered = snapshotState.consecutiveFailures > 0;
      snapshotState.ok = true;
      snapshotState.consecutiveFailures = 0;
      snapshotState.lastSuccessAt = Date.now();
      delete snapshotState.lastError;
      tripped = false;
      if (recovered) {
        emit("info", "simulation listener watchdog recovered", {
          probeHost,
          port: options.port,
          lastSuccessAt: snapshotState.lastSuccessAt
        });
      }
    } catch (error) {
      if (stopped) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      snapshotState.lastFailureAt = Date.now();
      snapshotState.lastError = failure.message;
      snapshotState.consecutiveFailures += 1;
      snapshotState.ok = snapshotState.consecutiveFailures < failureThreshold;
      emit(snapshotState.ok ? "warn" : "error", "simulation listener watchdog probe failed", {
        probeHost,
        port: options.port,
        consecutiveFailures: snapshotState.consecutiveFailures,
        failureThreshold,
        error: failure.message
      });
      if (!tripped && snapshotState.consecutiveFailures >= failureThreshold) {
        tripped = true;
        options.onUnhealthy?.(snapshot());
      }
    } finally {
      probeInFlight = false;
    }
  };

  const snapshot = (): ListenerHealthSnapshot => ({ ...snapshotState });

  return {
    start(): void {
      if (interval || stopped) return;
      void runProbe();
      interval = setInterval(() => {
        void runProbe();
      }, options.probeIntervalMs);
    },
    stop(): void {
      stopped = true;
      if (!interval) return;
      clearInterval(interval);
      interval = undefined;
    },
    snapshot
  };
};
