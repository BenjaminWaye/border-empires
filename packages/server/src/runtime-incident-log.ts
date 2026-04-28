import fs from "node:fs";
import path from "node:path";

export type RuntimeIncidentBreadcrumb = {
  at: number;
  bootId: string;
  kind: string;
  payload: Record<string, unknown>;
};

type RuntimeIncidentState = {
  bootId: string;
  startedAt: number;
  pid: number;
  cleanShutdown: boolean;
  shutdownSignal?: string;
  shutdownAt?: number;
  updatedAt: number;
};

export type RuntimeIncidentCrashReport = {
  previousBootId: string;
  startedAt: number;
  updatedAt: number;
  pid: number;
  cleanShutdown: false;
  breadcrumbs: RuntimeIncidentBreadcrumb[];
  likelyCause: string;
  summary: string;
};

export type RuntimeIncidentLog = {
  bootId: string;
  record: (kind: string, payload: Record<string, unknown>) => void;
  markCleanShutdown: (signal: string) => Promise<void>;
  flush: () => Promise<void>;
  getLastCrashReport: () => RuntimeIncidentCrashReport | undefined;
  notifyLastCrashReport: () => Promise<void>;
};

const INCIDENT_STATE_FILE = "runtime-incident-state.json";
const INCIDENT_BREADCRUMBS_FILE = "runtime-incident-breadcrumbs.json";
const INCIDENT_LAST_REPORT_FILE = "runtime-incident-last-report.json";
const MAX_BREADCRUMBS = 240;

const readJsonFile = <T>(file: string): T | undefined => {
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
};

const writeJsonAtomic = async (targetFile: string, value: unknown): Promise<void> => {
  const tmpFile = `${targetFile}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpFile, `${JSON.stringify(value, null, 2)}\n`);
  await fs.promises.rename(tmpFile, targetFile);
};

const summarizeLikelyCause = (breadcrumbs: RuntimeIncidentBreadcrumb[]): { likelyCause: string; summary: string } => {
  const recent = breadcrumbs.slice(-12);
  const lastChunk = [...recent].reverse().find((entry) => entry.kind === "chunk_snapshot" || entry.kind === "slow_chunk_snapshot");
  const lastSnapshot = [...recent].reverse().find((entry) => entry.kind === "snapshot_serialization");
  const lastWatermark = [...recent].reverse().find((entry) => entry.kind === "memory_watermark");
  const maxRss = recent.reduce((max, entry) => {
    const rss = typeof entry.payload.rssMb === "number" ? entry.payload.rssMb : 0;
    return Math.max(max, rss);
  }, 0);
  if (lastWatermark) {
    return {
      likelyCause: "memory_watermark",
      summary: `Memory crossed a high-watermark before the crash; max recorded RSS was ${maxRss.toFixed(1)} MB.`
    };
  }
  if (lastChunk && lastSnapshot) {
    return {
      likelyCause: "chunk_and_snapshot_overlap",
      summary: "Chunk sync and snapshot serialization were both active shortly before the crash."
    };
  }
  if (lastChunk) {
    return {
      likelyCause: "chunk_sync",
      summary: "Chunk snapshot work was the last recorded high-cost activity before the crash."
    };
  }
  if (lastSnapshot) {
    return {
      likelyCause: "snapshot_serialization",
      summary: "Snapshot serialization was the last recorded high-cost activity before the crash."
    };
  }
  return {
    likelyCause: "unknown",
    summary: recent.length > 0 ? "The server restarted without a clean shutdown, but no final high-signal breadcrumb was captured." : "No persisted breadcrumbs were available."
  };
};

const createCrashReport = (
  state: RuntimeIncidentState,
  breadcrumbs: RuntimeIncidentBreadcrumb[]
): RuntimeIncidentCrashReport => {
  const relevant = breadcrumbs.filter((entry) => entry.bootId === state.bootId);
  const cause = summarizeLikelyCause(relevant);
  return {
    previousBootId: state.bootId,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    pid: state.pid,
    cleanShutdown: false,
    breadcrumbs: relevant,
    likelyCause: cause.likelyCause,
    summary: cause.summary
  };
};

export const createRuntimeIncidentLog = (options: {
  snapshotDir: string;
  notifyWebhookUrl?: string;
  logger?: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
}): RuntimeIncidentLog => {
  const incidentDir = path.join(options.snapshotDir, "runtime-incidents");
  fs.mkdirSync(incidentDir, { recursive: true });
  const stateFile = path.join(incidentDir, INCIDENT_STATE_FILE);
  const breadcrumbsFile = path.join(incidentDir, INCIDENT_BREADCRUMBS_FILE);
  const lastReportFile = path.join(incidentDir, INCIDENT_LAST_REPORT_FILE);
  const previousState = readJsonFile<RuntimeIncidentState>(stateFile);
  const allBreadcrumbs = readJsonFile<RuntimeIncidentBreadcrumb[]>(breadcrumbsFile) ?? [];
  const lastCrashReport =
    previousState && previousState.cleanShutdown === false ? createCrashReport(previousState, allBreadcrumbs) : undefined;
  if (lastCrashReport) {
    fs.writeFileSync(lastReportFile, `${JSON.stringify(lastCrashReport, null, 2)}\n`);
  }

  const bootId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const state: RuntimeIncidentState = {
    bootId,
    startedAt: Date.now(),
    pid: process.pid,
    cleanShutdown: false,
    updatedAt: Date.now()
  };
  const breadcrumbs = allBreadcrumbs.filter((entry) => entry.bootId !== bootId).slice(-MAX_BREADCRUMBS);
  let writeQueue = Promise.resolve();

  const persist = (): Promise<void> => {
    state.updatedAt = Date.now();
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(async () => {
        await writeJsonAtomic(breadcrumbsFile, breadcrumbs.slice(-MAX_BREADCRUMBS));
        await writeJsonAtomic(stateFile, state);
      });
    return writeQueue;
  };

  const record = (kind: string, payload: Record<string, unknown>): void => {
    breadcrumbs.push({
      at: Date.now(),
      bootId,
      kind,
      payload
    });
    while (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
    void persist();
  };

  const markCleanShutdown = async (signal: string): Promise<void> => {
    state.cleanShutdown = true;
    state.shutdownSignal = signal;
    state.shutdownAt = Date.now();
    await persist();
  };

  const notifyLastCrashReport = async (): Promise<void> => {
    if (!lastCrashReport) return;
    options.logger?.error(lastCrashReport, "detected previous unclean shutdown");
    if (!options.notifyWebhookUrl) return;
    try {
      const response = await fetch(options.notifyWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          event: "server_unclean_shutdown",
          app: "border-empires",
          report: lastCrashReport
        })
      });
      if (!response.ok) {
        options.logger?.error(
          {
            status: response.status,
            statusText: response.statusText
          },
          "runtime incident webhook failed"
        );
      }
    } catch (err) {
      options.logger?.error({ err }, "runtime incident webhook failed");
    }
  };

  void persist();

  return {
    bootId,
    record,
    markCleanShutdown,
    flush: () => writeQueue,
    getLastCrashReport: () => lastCrashReport,
    notifyLastCrashReport
  };
};
