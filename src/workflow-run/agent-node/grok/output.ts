import { StringDecoder } from 'node:string_decoder';

export class GrokOutputParseError extends Error {}

export async function* parseGrokOutput(source: AsyncIterable<Buffer>): AsyncGenerator<unknown> {
  const decoder = new StringDecoder();
  let buffer = '';

  const parseLine = (line: string): unknown => {
    try {
      return JSON.parse(line);
    } catch {
      throw new GrokOutputParseError('Grok returned invalid JSON');
    }
  };

  const takeCompleteLines = (): string[] => {
    const lines: string[] = [];
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      lines.push(line);
      newlineIndex = buffer.indexOf('\n');
    }
    return lines;
  };

  for await (const chunk of source) {
    buffer += decoder.write(chunk);
    for (const line of takeCompleteLines()) {
      if (line.length > 0) yield parseLine(line);
    }
  }

  buffer += decoder.end();
  for (const line of takeCompleteLines()) {
    if (line.length > 0) yield parseLine(line);
  }
  if (buffer.length > 0) yield parseLine(buffer);
}
