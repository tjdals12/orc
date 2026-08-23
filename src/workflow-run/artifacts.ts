import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { tokenizeText } from '#workflow/node/text-token.js';

export function findMissingArtifacts(artifactsDirPath: string, artifactNames: string[]): string[] {
  const missingArtifactNames = artifactNames.filter((artifactName) => {
    const artifactPath = path.join(artifactsDirPath, artifactName);
    const artifactExists = fs.existsSync(artifactPath);
    return !artifactExists;
  });
  return missingArtifactNames;
}

export function collectArtifactNames(text: string): string[] {
  const { tokens } = tokenizeText(text);

  const artifactNames: string[] = [];
  for (const token of tokens) {
    if (token.kind === 'artifact' && !artifactNames.includes(token.name)) {
      artifactNames.push(token.name);
    }
  }
  return artifactNames;
}

export function readArtifactText(artifactDirPath: string, artifactName: string): string {
  const artifactPath = path.join(artifactDirPath, artifactName);

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(artifactPath);
  } catch (e) {
    const detail = e instanceof Error ? e.message : util.inspect(e);
    throw new Error(`Artifact "${artifactName}" could not be read: ${detail}`, { cause: e });
  }

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Artifact "${artifactName}" is not valid UTF-8 text.`);
  }

  const text = decoded.trim();
  if (text.length === 0) {
    throw new Error(`Artifact "${artifactName}" is empty. The prompt references its contents.`);
  }
  if (text.length > 2000) {
    throw new Error(
      `Artifact "${artifactName}" is too large to inline: ${text.length} chars (limit 2000). Name the path in the prompt instead and let the agent read it.`,
    );
  }
  return text;
}

export function renderText(
  text: string,
  args: {
    artifactTextByName: Map<string, string>;
    artifactsDirPath: string;
    input: string;
    reason?: string | undefined;
  },
): string {
  const { input, reason, artifactsDirPath, artifactTextByName } = args;

  const { tokens } = tokenizeText(text);
  const parts: string[] = [];
  for (const token of tokens) {
    if (token.kind === 'text') {
      parts.push(token.text);
    } else if (token.kind === 'input') {
      parts.push(input);
    } else if (token.kind === 'reason') {
      if (!reason) {
        throw new Error('No reason was provided. The text references $REASON.');
      }
      parts.push(reason);
    } else if (token.kind === 'artifacts-dir') {
      parts.push(artifactsDirPath);
    } else if (token.kind === 'artifact') {
      const artifactText = artifactTextByName.get(token.name);
      if (!artifactText) {
        throw new Error(`No text was provided for artifact "${token.name}".`);
      }
      parts.push(artifactText);
    } else {
      token satisfies never;
    }
  }

  const rendered = parts.join('');
  return rendered;
}
