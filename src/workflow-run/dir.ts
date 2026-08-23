import path from 'node:path';
import fs from 'node:fs';

export function measureDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let totalBytes = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalBytes += measureDirSize(entryPath);
      continue;
    }
    if (entry.isFile()) {
      totalBytes += fs.statSync(entryPath).size;
    }
  }
  return totalBytes;
}

export function collectOrphanedDirPaths(
  projectsAreaDirPath: string,
  workflowRunIdsByProjectId: Map<string, Set<string>>,
): string[] {
  if (!fs.existsSync(projectsAreaDirPath)) {
    return [];
  }

  const orphanedDirPaths: string[] = [];
  const areaEntries = fs.readdirSync(projectsAreaDirPath, { withFileTypes: true });
  for (const areaEntry of areaEntries) {
    if (!areaEntry.isDirectory()) {
      continue;
    }

    const projectRunsDirPath = path.join(projectsAreaDirPath, areaEntry.name);
    const workflowRunIds = workflowRunIdsByProjectId.get(areaEntry.name);
    if (workflowRunIds === undefined) {
      orphanedDirPaths.push(projectRunsDirPath);
      continue;
    }

    const runEntries = fs.readdirSync(projectRunsDirPath, { withFileTypes: true });
    for (const runEntry of runEntries) {
      if (!runEntry.isDirectory()) {
        continue;
      }
      if (!workflowRunIds.has(runEntry.name)) {
        orphanedDirPaths.push(path.join(projectRunsDirPath, runEntry.name));
      }
    }
  }

  return orphanedDirPaths;
}
