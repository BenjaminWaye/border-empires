import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AiTrainingRecord } from "./ai-training-records.js";

export type AiTrainingRecorder = {
  record(record: AiTrainingRecord): void;
  flush(): Promise<void>;
};

const noopRecorder: AiTrainingRecorder = {
  record() {},
  async flush() {}
};

export const createAiTrainingRecorder = (outputPath: string | undefined): AiTrainingRecorder => {
  const normalizedPath = outputPath?.trim();
  if (!normalizedPath) return noopRecorder;

  let pending: Promise<void> = mkdir(path.dirname(normalizedPath), { recursive: true }).then(() => undefined);

  return {
    record(record) {
      pending = pending.then(async () => {
        await appendFile(normalizedPath, `${JSON.stringify(record)}\n`, "utf8");
      });
      void pending.catch((error) => {
        console.error("[ai-training-recorder] failed to append record", error);
      });
    },
    async flush() {
      await pending;
    }
  };
};
