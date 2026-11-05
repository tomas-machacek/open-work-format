import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const maximumWords = 1500;
/** @param {string} source */
export function countWords(source) {
  return source.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
}
/** @param {string} path */
export function checkCodeMap(path) {
  let count;
  try {
    count = countWords(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(
      `[code-map] ${path}: cannot read input; ceiling=${maximumWords}. ${String(error)}`,
    );
    return 1;
  }
  console.log(`[code-map] ${path}: ${count} words; ceiling=${maximumWords}`);
  if (count <= maximumWords) return 0;
  console.error(
    'Preserve useful navigation and readable prose; move excess detail to its primary documentation home.',
  );
  return 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = checkCodeMap(process.argv[2] ?? 'docs/code-map.md');
}
