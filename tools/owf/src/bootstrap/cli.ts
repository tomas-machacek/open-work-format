#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCli } from '../interfaces/cli/index.js';
import {
  initialize,
  create,
  createAction,
  getAction,
  listActions,
} from './workspaces.js';

const metadata: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
if (
  typeof metadata !== 'object' ||
  metadata === null ||
  !('version' in metadata) ||
  typeof metadata.version !== 'string'
)
  throw new Error('Invalid package version');
runCli(
  process.argv,
  metadata.version,
  (title) => initialize(process.cwd(), title),
  (input) => create(process.cwd(), input),
  (input) => createAction(process.cwd(), input),
  (identifier) => getAction(process.cwd(), identifier),
  (input) => listActions(process.cwd(), input),
);
