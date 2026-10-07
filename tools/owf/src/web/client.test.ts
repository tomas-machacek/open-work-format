import { afterEach, expect, test, vi } from 'vitest';
import {
  fetchBoard,
  fetchOwners,
  saveAction,
  updateActionState,
} from './client.js';
afterEach(() => vi.unstubAllGlobals());
test('board query serialization preserves literal search and canonical URL escapes', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ workspace: { root: '/work' }, actions: [] }),
        ),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const query = {
    search: 'a & b + %_ **č**',
    owner: '/_projects/a%20%26%25/child/',
    recursive: true,
  };
  await fetchBoard(query);
  const called = fetch.mock.calls[0]![0];
  expect(typeof called).toBe('string');
  const url = new URL(called as string, 'http://localhost');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    ...query,
    recursive: 'true',
  });
  await fetchBoard();
  expect(fetch).toHaveBeenLastCalledWith('/api/actions', { cache: 'no-store' });
});
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

test('state update sends the observed snapshot once and reports conflict or uncertain delivery', async () => {
  const action = {
    id: 'saved',
    title: 'Work',
    owner: { url: '/' },
    state: 'waiting',
    created_at: 'now',
    updated_at: 'later',
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'updated', action })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'ACTION_CONFLICT',
            message: 'Changed elsewhere.',
          },
        }),
        { status: 409 },
      ),
    )
    .mockRejectedValueOnce(new TypeError('Connection lost'));
  vi.stubGlobal('fetch', fetch);
  const input = {
    state: 'waiting' as const,
    expected: {
      state: 'open' as const,
      updated_at: 'earlier',
    },
  };
  expect(await updateActionState('saved', input)).toEqual(action);
  expect(fetch).toHaveBeenCalledWith('/api/actions/saved/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await expect(updateActionState('saved', input)).rejects.toMatchObject({
    code: 'ACTION_CONFLICT',
  });
  await expect(updateActionState('saved', input)).rejects.toMatchObject({
    code: 'UNCERTAIN',
  });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('owner reads bypass cache, reject malformed success and retain discovery errors', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  const owners = [
    { url: '/', type: 'workspace', title: 'Workspace', hierarchy: 'Workspace' },
  ];
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ owners })));
  expect(await fetchOwners()).toEqual(owners);
  expect(fetch).toHaveBeenCalledWith('/api/owners', { cache: 'no-store' });
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ owners: [{ url: '/' }] })),
  );
  await expect(fetchOwners()).rejects.toThrow();
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: {
          code: 'OWNER_DISCOVERY_FAILED',
          message: 'Cannot read README',
        },
      }),
      { status: 503 },
    ),
  );
  await expect(fetchOwners()).rejects.toThrow('Cannot read README');
});
