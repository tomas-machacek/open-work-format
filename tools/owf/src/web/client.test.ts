import { afterEach, expect, test, vi } from 'vitest';
import { fetchBoard } from './client.js';
afterEach(() => vi.unstubAllGlobals());
test('API client propagates HTTP read errors and rejects malformed successful payloads', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: { code: 'STORE_UNAVAILABLE', message: 'Store unavailable' },
      }),
      { status: 503 },
    ),
  );
  await expect(fetchBoard()).rejects.toThrow('Store unavailable');
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        workspace: { root: '/work' },
        actions: [{ state: 'unknown' }],
      }),
    ),
  );
  await expect(fetchBoard()).rejects.toThrow();
});
