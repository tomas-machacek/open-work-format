export function literal(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+.!|>~<&]/gu, (character) =>
    character === '&' ? '&amp;' : character === '<' ? '&lt;' : `\\${character}`,
  );
}
