#!/usr/bin/env node
import { toolVersion } from '../infrastructure/runtime/index.js';
import { runCli } from '../interfaces/cli/index.js';
import {
  initialize,
  create,
  createAction,
  getAction,
  listActions,
  setAction,
  createView,
  getView,
  listViews,
  showView,
  moveAction,
  deleteAction,
  deleteView,
} from './workspaces.js';

await runCli(
  process.argv,
  toolVersion,
  (title) => initialize(process.cwd(), title),
  (input) => create(process.cwd(), input),
  (input) => createAction(process.cwd(), input),
  (identifier) => getAction(process.cwd(), identifier),
  (input) => listActions(process.cwd(), input),
  (identifier, input) => setAction(process.cwd(), identifier, input),
  async (port) => {
    const { serve } = await import('./server.js');
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
  {
    create: (input) => createView(process.cwd(), input),
    get: (id) => getView(process.cwd(), id),
    list: () => listViews(process.cwd()),
    show: (id) => showView(process.cwd(), id),
    move: (id, input) => moveAction(process.cwd(), id, input),
  },
  {
    action: (id) => deleteAction(process.cwd(), id),
    view: (id) => deleteView(process.cwd(), id),
  },
);
