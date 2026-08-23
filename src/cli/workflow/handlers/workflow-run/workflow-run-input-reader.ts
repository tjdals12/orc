import path from 'node:path';
import fs from 'node:fs';
import util from 'node:util';

import { WorkflowRunError } from '#workflow-run/error.js';

import type { WorkflowRunInput } from './types.js';

export class WorkflowRunInputReader {
  read(inputSource: WorkflowRunInput | null): string | null {
    if (inputSource === null) {
      return null;
    }

    if (inputSource.kind === 'file') {
      const input = this.readFile(inputSource.path);
      return input;
    }

    const input = this.readInline(inputSource.text);
    return input;
  }

  private readFile(filePath: string): string {
    const absolutePath = path.resolve(filePath);

    const fileExists = fs.existsSync(absolutePath);
    if (!fileExists) {
      throw new WorkflowRunError(`No input file at ${absolutePath}.`);
    }

    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(absolutePath);
    } catch (e) {
      const detail = e instanceof Error ? e.message : util.inspect(e);
      throw new WorkflowRunError(`The input file at ${absolutePath} could not be read: ${detail}`);
    }

    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new WorkflowRunError(`The input file at ${absolutePath} is not valid UTF-8 text.`);
    }

    const text = decoded.trim();
    if (text.length === 0) {
      throw new WorkflowRunError(`The input file at ${absolutePath} is empty.`);
    }

    return text;
  }

  private readInline(text: string): string {
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      throw new WorkflowRunError('The input is empty.');
    }
    if (trimmedText.length > 1000) {
      throw new WorkflowRunError(
        `The input is too long for --input: ${trimmedText.length} chars (limit 1000). Write it to a file and pass --input-file <path>.`,
      );
    }
    return trimmedText;
  }
}
