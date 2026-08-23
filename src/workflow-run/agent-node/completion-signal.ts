function escapeRegExp(text: string): string {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped;
}

export function detectCompletionSignal(text: string, signal: string): boolean {
  const escapedSignal = escapeRegExp(signal);
  const tagWrappedPattern = new RegExp(`<([a-zA-Z][\\w-]*)[^>]*>\\s*${escapedSignal}\\s*</\\1>`);
  const endPattern = new RegExp(`${escapedSignal}[\\s.,;:!?*_\`]*$`);
  const ownLinePattern = new RegExp(`^\\s*[*_\`]*${escapedSignal}[*_\`]*\\s*$`, 'm');

  const detected =
    tagWrappedPattern.test(text) || endPattern.test(text) || ownLinePattern.test(text);
  return detected;
}
