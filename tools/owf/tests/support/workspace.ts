import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'owf Ž test '));
}
export function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
export function snapshot(
  root: string,
  omitted: readonly string[] = [],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (omitted.includes(join(root, entry.name))) continue;
    if (entry.isDirectory()) {
      result[`${entry.name}/`] = 'directory';
      for (const [name, value] of Object.entries(
        snapshot(join(root, entry.name), omitted),
      ))
        result[`${entry.name}/${name}`] = value;
    } else
      result[entry.name] = readFileSync(join(root, entry.name)).toString(
        'base64',
      );
  }
  return result;
}
