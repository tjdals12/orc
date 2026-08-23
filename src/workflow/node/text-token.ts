type TextToken =
  | { kind: 'text'; text: string }
  | { kind: 'artifacts-dir' }
  | { kind: 'input' }
  | { kind: 'artifact'; name: string }
  | { kind: 'reason' };

function isIdentifierChar(char: string): boolean {
  return (char >= 'A' && char <= 'Z') || char === '_';
}

function endsToken(char: string): boolean {
  const continuesToken = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
  return !continuesToken;
}

export function tokenizeText(text: string): {
  tokens: TextToken[];
  unclosedArtifactReference: boolean;
} {
  const tokens: TextToken[] = [];
  let unclosedArtifactReference = false;
  let plainStart = 0;
  let cursor = 0;

  const pushPlainText = (end: number): void => {
    if (end > plainStart) {
      tokens.push({ kind: 'text', text: text.slice(plainStart, end) });
    }
  };

  while (cursor < text.length) {
    if (text.charAt(cursor) !== '$') {
      cursor += 1;
      continue;
    }

    let identifierEnd = cursor + 1;
    while (isIdentifierChar(text.charAt(identifierEnd))) {
      identifierEnd += 1;
    }
    const identifier = text.slice(cursor + 1, identifierEnd);

    if (identifier === 'ARTIFACT' && text.charAt(identifierEnd) === '(') {
      const closingIndex = text.indexOf(')', identifierEnd + 1);
      if (closingIndex === -1) {
        unclosedArtifactReference = true;
        cursor += 1;
        continue;
      }
      pushPlainText(cursor);
      tokens.push({ kind: 'artifact', name: text.slice(identifierEnd + 1, closingIndex) });
      cursor = closingIndex + 1;
      plainStart = cursor;
      continue;
    }

    if (identifier === 'ARTIFACTS_DIR' && endsToken(text.charAt(identifierEnd))) {
      pushPlainText(cursor);
      tokens.push({ kind: 'artifacts-dir' });
      cursor = identifierEnd;
      plainStart = cursor;
      continue;
    }

    if (identifier === 'INPUT' && endsToken(text.charAt(identifierEnd))) {
      pushPlainText(cursor);
      tokens.push({ kind: 'input' });
      cursor = identifierEnd;
      plainStart = cursor;
      continue;
    }

    if (identifier === 'REASON' && endsToken(text.charAt(identifierEnd))) {
      pushPlainText(cursor);
      tokens.push({ kind: 'reason' });
      cursor = identifierEnd;
      plainStart = cursor;
      continue;
    }

    cursor += 1;
  }

  pushPlainText(text.length);
  return { tokens, unclosedArtifactReference };
}
