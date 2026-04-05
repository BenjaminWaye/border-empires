export type SimulationCommandPriority = "human" | "system" | "ai";

export type SimulationDispatchJobMeta = {
  jobId: number;
  priority: SimulationCommandPriority;
};

export type SimulationCommandBusWorkerMessage =
  | {
      type: "configure";
      drainBudgetMs: number;
      drainMaxCommands: number;
      drainHumanQuota: number;
      drainSystemQuota: number;
      drainAiQuota: number;
    }
  | {
      type: "enqueue";
      job: SimulationDispatchJobMeta;
    }
  | {
      type: "batch_complete";
    };

export type SimulationCommandBusWorkerResponse =
  | {
      type: "ready";
    }
  | {
      type: "dispatch_batch";
      jobs: SimulationDispatchJobMeta[];
      queueDepths: {
        human: number;
        system: number;
        ai: number;
      };
    };
