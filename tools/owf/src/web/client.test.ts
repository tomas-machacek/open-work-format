import { afterEach, expect, test, vi } from 'vitest';
import { fetchBoard, saveAction } from './client.js';
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

test('create sends JSON once, parses confirmation and preserves server error feedback', async () => {
  const action = {
    id: 'saved',
    title: 'Work',
    owner: { url: '/' },
    state: 'waiting',
    waiting_for: 'Reply',
    created_at: 'now',
    updated_at: 'now',
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ action }), { status: 201 }),
    );
  vi.stubGlobal('fetch', fetch);
  const input = {
    title: 'Work',
    owner: '/',
    state: 'waiting',
    waitingFor: 'Reply',
  };
  expect(await saveAction(input)).toEqual(action);
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: { code: 'INVALID_OWNER', message: 'Invalid owner URL.' },
      }),
      { status: 400 },
    ),
  );
  await expect(saveAction(input)).rejects.toThrow('Invalid owner URL.');
});

test.each(['network', 'body', 'contract'])(
  'uncertain %s failure explains checking before resubmission and never retries',
  async (failure) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    if (failure === 'network')
      fetch.mockRejectedValue(new TypeError('Connection lost'));
    else
      fetch.mockResolvedValue(
        new Response(failure === 'body' ? '{' : '{}', { status: 201 }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      saveAction({ title: 'Work', owner: '/', state: 'open' }),
    ).rejects.toThrow('Refresh and check the board before submitting again');
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
