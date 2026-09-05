export type SemanticVersion = {
  major: number;
  minor: number;
  patch: number;
};

export function parseSemanticVersion(text: string): SemanticVersion | null {
  const versionText = text.split(' ')[0];
  if (versionText === undefined) {
    return null;
  }

  const [majorText, minorText, patchText, ...remainingParts] = versionText.split('.');
  if (
    majorText === undefined ||
    minorText === undefined ||
    patchText === undefined ||
    remainingParts.length > 0
  ) {
    return null;
  }
  if (!/^\d+$/.test(majorText) || !/^\d+$/.test(minorText) || !/^\d+$/.test(patchText)) {
    return null;
  }

  return {
    major: Number(majorText),
    minor: Number(minorText),
    patch: Number(patchText),
  };
}

export function isOlderVersion(left: SemanticVersion, right: SemanticVersion): boolean {
  if (left.major !== right.major) return left.major < right.major;
  if (left.minor !== right.minor) return left.minor < right.minor;
  return left.patch < right.patch;
}

export function isNewerVersion(left: SemanticVersion, right: SemanticVersion): boolean {
  return isOlderVersion(right, left);
}
