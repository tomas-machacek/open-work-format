import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const metadata: unknown = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
);
if (
  typeof metadata !== 'object' ||
  metadata === null ||
  !('version' in metadata) ||
  typeof metadata.version !== 'string'
)
  throw new Error('Invalid package version');
export const toolVersion = metadata.version;

export const newActionId = (): string => randomUUID();
export const currentTimestamp = (): string => new Date().toISOString();
