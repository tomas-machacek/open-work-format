// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { fetchInbox, writeInbox } from './inboxClient.js';

afterEach(() => vi.unstubAllGlobals());
const item = {
  id: '00000000-0000-4000-8000-000000000001',
  captured_at: '2026-11-07T10:00:00.000Z',
  text: '  Život\r\n[plain](x)\t',
};
test('Inbox client sends literal strict JSON and validates read responses', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ item }), { status: 201 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ workspace: { root: '/one' }, items: [item] }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  expect(await writeInbox('capture', item.text)).toEqual(item);
  expect(fetch).toHaveBeenNthCalledWith(1, '/api/inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: item.text }),
  });
  expect((await fetchInbox()).items).toEqual([item]);
  expect(fetch).toHaveBeenLastCalledWith('/api/inbox', { cache: 'no-store' });
});
test('known Inbox rejection remains a rejection; transport and malformed or mismatched receipts are uncertain and never retried', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'INBOX_NOT_FOUND', message: 'Missing item' },
        }),
        { status: 404 },
      ),
    )
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          item: { ...item, id: '00000000-0000-4000-8000-000000000002' },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: item.id, status: 'resolved' })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'INBOX_OPERATION_FAILED', message: 'Adapter failed' },
        }),
        { status: 503 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(writeInbox('save', item.text, item.id)).rejects.toMatchObject({
    code: 'INBOX_NOT_FOUND',
    message: 'Missing item',
  });
  await expect(writeInbox('capture', item.text)).rejects.toMatchObject({
    code: 'UNCERTAIN',
  });
  await expect(writeInbox('capture', item.text)).rejects.toMatchObject({
    code: 'UNCERTAIN',
  });
  await expect(writeInbox('save', item.text, item.id)).rejects.toMatchObject({
    code: 'UNCERTAIN',
  });
  await expect(writeInbox('discard', '', item.id)).rejects.toMatchObject({
    code: 'UNCERTAIN',
  });
  await expect(writeInbox('capture', item.text)).rejects.toMatchObject({
    code: 'UNCERTAIN',
  });
  expect(fetch).toHaveBeenCalledTimes(6);
});
