export const PREVIEW_LIMIT = 200;

function isByteArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  );
}

export function tryDecodeOutputText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isByteArray(value)) return Buffer.from(value).toString('utf8');

  if (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    'data' in value &&
    value.type === 'Buffer' &&
    isByteArray(value.data)
  ) {
    return Buffer.from(value.data).toString('utf8');
  }

  return null;
}
