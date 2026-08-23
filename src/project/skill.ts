import fs from 'node:fs';

import { parse } from 'yaml';
import { z } from 'zod';

const SkillFrontmatterSchema = z.object({
  metadata: z.object({
    version: z.string().min(1),
  }),
});

type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;

export type SkillStatus =
  | { status: 'installed'; version: string }
  | { status: 'not-installed' }
  | { status: 'outdated'; current: string };

export type SkillInstallOutcome = 'installed' | 'updated' | 'unchanged';

function tryReadSkillFrontmatter(skillFilePath: string): SkillFrontmatter | null {
  try {
    const text = fs.readFileSync(skillFilePath, 'utf8');
    const frontmatterMatch = FRONTMATTER_PATTERN.exec(text);
    if (frontmatterMatch === null) {
      return null;
    }

    const frontmatterText = frontmatterMatch[1] ?? '';
    const parsed = SkillFrontmatterSchema.safeParse(parse(frontmatterText));
    if (!parsed.success) {
      return null;
    }

    const frontmatter = parsed.data;
    return frontmatter;
  } catch {
    return null;
  }
}

export function checkSkillStatus(args: {
  sourceSkillFilePath: string;
  installedSkillFilePaths: string[];
}): SkillStatus {
  const sourceFrontmatter = tryReadSkillFrontmatter(args.sourceSkillFilePath);
  if (sourceFrontmatter === null) {
    throw new Error(`The packaged skill is unreadable: ${args.sourceSkillFilePath}.`);
  }
  const currentVersion = sourceFrontmatter.metadata.version;

  const installedVersions = args.installedSkillFilePaths.map(
    (skillFilePath) => tryReadSkillFrontmatter(skillFilePath)?.metadata.version ?? null,
  );

  const everyCopyCurrent = installedVersions.every((version) => version === currentVersion);
  if (everyCopyCurrent) {
    const skillStatus: SkillStatus = { status: 'installed', version: currentVersion };
    return skillStatus;
  }

  const noCopyPresent = args.installedSkillFilePaths.every(
    (skillFilePath) => !fs.existsSync(skillFilePath),
  );
  if (noCopyPresent) {
    const skillStatus: SkillStatus = { status: 'not-installed' };
    return skillStatus;
  }

  const skillStatus: SkillStatus = { status: 'outdated', current: currentVersion };
  return skillStatus;
}

export function installProjectSkill(args: {
  sourceSkillDirPath: string;
  targetSkillDirPaths: string[];
  priorStatus: SkillStatus;
}): SkillInstallOutcome {
  for (const targetSkillDirPath of args.targetSkillDirPaths) {
    fs.rmSync(targetSkillDirPath, { recursive: true, force: true });
    fs.cpSync(args.sourceSkillDirPath, targetSkillDirPath, { recursive: true });
  }

  switch (args.priorStatus.status) {
    case 'not-installed':
      return 'installed';
    case 'outdated':
      return 'updated';
    case 'installed':
      return 'unchanged';
  }
}
