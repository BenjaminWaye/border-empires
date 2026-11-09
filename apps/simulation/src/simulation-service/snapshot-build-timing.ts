type SnapshotTimingRecorder = (phase: string, durationMs: number, payload?: Record<string, unknown>) => void;
interface SnapshotTimingDependencies {
  slowSnapshotBuildWarnMs: number;
  recordLagDiagnostic: (level: "warn", message: string, payload: Record<string, unknown>) => void;
}
export const createSnapshotBuildTimingRecorder = ({ slowSnapshotBuildWarnMs, recordLagDiagnostic }: SnapshotTimingDependencies): SnapshotTimingRecorder =>
  (phase, durationMs, payload = {}) => {
    if (slowSnapshotBuildWarnMs <= 0 || durationMs < slowSnapshotBuildWarnMs) return;
    recordLagDiagnostic("warn", "simulation_snapshot_build_slow", { phase, durationMs, ...payload });
  };
