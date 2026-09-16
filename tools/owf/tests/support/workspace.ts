import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'owf Ž test '));
}
export function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
export function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const [name, value] of Object.entries(
        snapshot(join(root, entry.name)),
      ))
        result[`${entry.name}/${name}`] = value;
    } else
      result[entry.name] = readFileSync(join(root, entry.name)).toString(
        'base64',
      );
  }
  return result;
}
