import { StringDecoder } from 'node:string_decoder';

function renderCarriageReturns(line: string): string {
  if (!line.includes('\r')) {
    return line;
  }
  const cells: string[] = [];
  let cursor: number = 0;
  for (const char of line) {
    if (char === '\r') {
      cursor = 0;
      continue;
    }
    cells[cursor] = char;
    cursor += 1;
  }
  const renderedLine = cells.join('');
  return renderedLine;
}

type RelayStep = { kind: 'chunk'; result: IteratorResult<Buffer> } | { kind: 'idle' };

type IdleTimeout = { expired: Promise<RelayStep>; cancel: () => void };

function startIdleTimeout(delayMs: number): IdleTimeout {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<RelayStep>((resolve) => {
    timer = setTimeout(() => {
      resolve({ kind: 'idle' });
    }, delayMs);
  });

  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };

  return {
    expired,
    cancel,
  };
}

type RecordOutputLine = (text: string) => Promise<void>;

export async function relayOutputLines(
  source: AsyncIterable<Buffer>,
  recordLine: RecordOutputLine,
): Promise<void> {
  const decoder = new StringDecoder();
  let buffer: string = '';
  let pendingLineRecorded: boolean = false;

  const recordPendingLine = async (): Promise<void> => {
    const text = renderCarriageReturns(buffer);
    buffer = '';
    if (text.length > 0) {
      await recordLine(text);
      pendingLineRecorded = true;
    }
  };

  const recordCompleteLines = async (): Promise<void> => {
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const text = renderCarriageReturns(line);
      const isLeftoverNewline = text.length === 0 && pendingLineRecorded;
      if (!isLeftoverNewline) {
        await recordLine(text);
      }
      pendingLineRecorded = false;
      newlineIndex = buffer.indexOf('\n');
    }
  };

  const iterator = source[Symbol.asyncIterator]();
  const readChunk = async (): Promise<RelayStep> => {
    const result = await iterator.next();
    return { kind: 'chunk', result };
  };

  let pendingChunk = readChunk();
  try {
    while (true) {
      const idle = buffer.length > 0 ? startIdleTimeout(2_000) : undefined;
      const raced = idle === undefined ? pendingChunk : Promise.race([pendingChunk, idle.expired]);
      const step = await raced;
      idle?.cancel();
      if (step.kind === 'idle') {
        await recordPendingLine();
        continue;
      }
      if (step.result.done) {
        break;
      }
      buffer += decoder.write(step.result.value);
      await recordCompleteLines();
      pendingChunk = readChunk();
    }
  } finally {
    await iterator.return?.();
  }

  buffer += decoder.end();
  await recordCompleteLines();
  await recordPendingLine();
}
