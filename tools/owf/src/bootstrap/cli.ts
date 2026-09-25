#!/usr/bin/env node
import { serve } from './server.js';
import { readFileSync } from 'node:fs';
import { runCli } from '../interfaces/cli/index.js';
import {
  initialize,
  create,
  createAction,
  getAction,
  listActions,
  setAction,
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
await runCli(
  process.argv,
  metadata.version,
  (title) => initialize(process.cwd(), title),
  (input) => create(process.cwd(), input),
  (input) => createAction(process.cwd(), input),
  (identifier) => getAction(process.cwd(), identifier),
  (input) => listActions(process.cwd(), input),
  (identifier, input) => setAction(process.cwd(), identifier, input),
  async (port) => {
    const server = await serve(process.cwd(), port);
    const stop = () => {
      void server.close().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return `http://127.0.0.1:${port}`;
  },
);
