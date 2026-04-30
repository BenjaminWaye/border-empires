import fs from "node:fs";
import { parentPort } from "node:worker_threads";

import type {
  SnapshotEconomySection,
  SnapshotMetaSection,
  SnapshotPlayersSection,
  SnapshotSectionIndex,
  SnapshotSystemsSection,
  SnapshotTerritorySection
} from "./server-shared-types.js";

type SnapshotSaveSections = {
  meta: SnapshotMetaSection;
  players: SnapshotPlayersSection;
  territory: SnapshotTerritorySection;
  economy: SnapshotEconomySection;
  systems: SnapshotSystemsSection;
};

type SnapshotSaveWorkerRequest = {
  id: number;
  snapshotDir: string;
  snapshotIndexFile: string;
  snapshotSectionFiles: Record<keyof SnapshotSectionIndex["sections"], string>;
  sectionFilePaths: Record<keyof SnapshotSectionIndex["sections"], string>;
  sections: SnapshotSaveSections;
};

type SnapshotSaveWorkerResponse = { id: number } | { id: number; error: string };

const writeSnapshotJsonAtomic = async (targetFile: string, serialized: string): Promise<void> => {
  const tmpFile = `${targetFile}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpFile, serialized);
  await fs.promises.rename(tmpFile, targetFile);
};

const port = parentPort;

if (port) {
  port.on("message", async (message: SnapshotSaveWorkerRequest) => {
    try {
      const index: SnapshotSectionIndex = {
        formatVersion: 2,
        sections: message.snapshotSectionFiles
      };

      await fs.promises.mkdir(message.snapshotDir, { recursive: true });
      await writeSnapshotJsonAtomic(message.sectionFilePaths.meta, JSON.stringify(message.sections.meta));
      await writeSnapshotJsonAtomic(message.sectionFilePaths.players, JSON.stringify(message.sections.players));
      await writeSnapshotJsonAtomic(message.sectionFilePaths.territory, JSON.stringify(message.sections.territory));
      await writeSnapshotJsonAtomic(message.sectionFilePaths.economy, JSON.stringify(message.sections.economy));
      await writeSnapshotJsonAtomic(message.sectionFilePaths.systems, JSON.stringify(message.sections.systems));
      await writeSnapshotJsonAtomic(message.snapshotIndexFile, JSON.stringify(index));
      port.postMessage({ id: message.id } satisfies SnapshotSaveWorkerResponse);
    } catch (err) {
      port.postMessage({
        id: message.id,
        error: err instanceof Error ? err.message : String(err)
      } satisfies SnapshotSaveWorkerResponse);
    }
  });
}
