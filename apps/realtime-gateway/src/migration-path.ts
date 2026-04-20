import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const candidatePathsFor = (filename: string, metaUrl: string): string[] => [
  path.resolve(fileURLToPath(new URL(`../sql/${filename}`, metaUrl))),
  path.resolve(fileURLToPath(new URL(`../../../../sql/${filename}`, metaUrl)))
];

export const resolveGatewayMigrationPath = async (filename: string, metaUrl: string): Promise<string> => {
  for (const candidatePath of candidatePathsFor(filename, metaUrl)) {
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }
  return candidatePathsFor(filename, metaUrl)[0]!;
};
