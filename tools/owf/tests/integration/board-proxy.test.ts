import { createServer } from 'vite';
import { expect, test } from 'vitest';
import viteConfig from '../../vite.config.js';
import { serve } from '../../src/bootstrap/server.js';
import { initialize, listActions } from '../../src/bootstrap/workspaces.js';
import { boardError } from '../../src/contracts/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

test('Vite proxy rejects a foreign backend Origin without Fetch Metadata before any write', async () => {
  const root = temporaryDirectory();
  initialize(root);
  // Exercise the real configured proxy target, including its Host rewrite.
  const backend = await serve(root, 4317);
  const vite = await createServer({
    ...viteConfig,
    configFile: false,
    server: { ...viteConfig.server, port: 0, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing Vite address');
    const origin = `http://127.0.0.1:${address.port}`;
    const before = snapshot(root);
    const post = (requestOrigin: string) =>
      fetch(`${origin}/api/actions`, {
        method: 'POST',
        headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'From development board',
          owner: '/',
          state: 'waiting',
        }),
      });
    // This is the backend origin, but is cross-origin at the proxy boundary.
    // Do not rely on optional Sec-Fetch-Site to reject it.
    const rejected = await post('http://127.0.0.1:4317');
    expect(rejected.status).toBe(403);
    expect(boardError.parse(await rejected.json()).error.code).toBe(
      'ORIGIN_REJECTED',
    );
    expect(snapshot(root)).toEqual(before);
    const accepted = await post(origin);
    expect(accepted.status).toBe(201);
    expect(listActions(root).result.actions).toHaveLength(1);
  } finally {
    await vite.close();
    await backend.close();
    cleanup(root);
  }
});
