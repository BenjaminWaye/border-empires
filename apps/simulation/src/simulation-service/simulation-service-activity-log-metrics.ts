type ActivityLogGauge = { entryCount: number; capHits: number };

type ActivityLogMetricRuntime = {
  manpowerCapBootstrapRestampedTotal: () => number;
  territoryFlipLogGauge: () => ActivityLogGauge;
  combatManpowerLogGauge: () => ActivityLogGauge;
  personalImpactLogGauge: () => ActivityLogGauge;
};

type ActivityLogMetricSink = {
  setSimManpowerCapBootstrapRestampedTotal: (value: number) => void;
  setSimActivityLogStats: (stats: {
    territoryFlipEntries: number;
    combatManpowerEntries: number;
    personalImpactEntries: number;
    personalImpactCapHits: number;
  }) => void;
};

export const sampleActivityLogMetrics = (runtime: ActivityLogMetricRuntime, metrics: ActivityLogMetricSink): void => {
  const territory = runtime.territoryFlipLogGauge();
  const combat = runtime.combatManpowerLogGauge();
  const personalImpact = runtime.personalImpactLogGauge();
  metrics.setSimManpowerCapBootstrapRestampedTotal(runtime.manpowerCapBootstrapRestampedTotal());
  metrics.setSimActivityLogStats({
    territoryFlipEntries: territory.entryCount,
    combatManpowerEntries: combat.entryCount,
    personalImpactEntries: personalImpact.entryCount,
    personalImpactCapHits: personalImpact.capHits
  });
};
