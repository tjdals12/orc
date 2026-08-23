import { createRequire } from 'node:module';

export function tryCreateRequireFromPackage(packageName: string): NodeRequire | null {
  try {
    const packageUrl = import.meta.resolve(packageName);
    const packageRequire = createRequire(packageUrl);
    return packageRequire;
  } catch {
    return null;
  }
}

export function tryResolvePath(fromRequire: NodeRequire, specifier: string): string | null {
  try {
    const resolvedPath = fromRequire.resolve(specifier);
    return resolvedPath;
  } catch {
    return null;
  }
}
