// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Board } from './Board.js';
import type { BoardResponse } from '../contracts/index.js';
const data: BoardResponse = {
  workspace: { root: 'C:/Work' },
  actions: [
    {
      id: 'one',
      title: 'First',
      state: 'open',
      owner: { url: '/' },
      created_at: 'now',
      updated_at: 'now',
    },
    {
      id: 'two',
      title: 'Second',
      state: 'open',
      owner: { url: '/_projects/hello/' },
      created_at: 'before',
      updated_at: 'before',
    },
    {
      id: 'three',
      title: 'Waiting task',
      state: 'waiting',
      waiting_for: 'Supplier reply',
      owner: { url: '/' },
      created_at: 'before',
      updated_at: 'before',
    },
  ],
};
function deferred() {
  let resolve!: (data: BoardResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<BoardResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
test('refresh retains card nodes and order, marks failed data stale, retries and ignores older responses', async () => {
  const pending = deferred();
  const older = deferred();
  const newer = deferred();
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockReturnValueOnce(pending.promise)
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  render(<Board load={load} />);
  await screen.findByText('First');
  expect(
    screen
      .getAllByRole('heading', { level: 2 })
      .map((node) => node.textContent),
  ).toEqual(['Open2', 'In Progress0', 'Waiting1', 'Completed0', 'Cancelled0']);
  const cards = within(
    screen.getByRole('region', { name: 'Open' }),
  ).getAllByRole('article');
  expect(
    cards.map((card) => within(card).getByRole('heading').textContent),
  ).toEqual(['First', 'Second']);
  expect(screen.getByText('Supplier reply')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(screen.getByText('First').closest('article')).toBe(cards[0]);
  expect(screen.getByRole('status').textContent).toBe('Refreshing…');
  await act(async () => {
    pending.reject(new Error('Store unavailable'));
    await pending.promise.catch(() => undefined);
  });
  expect(screen.getByRole('alert').textContent).toContain('out of date');
  expect(screen.getByText('First').closest('article')).toBe(cards[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(() => {
    newer.resolve({
      ...data,
      actions: [{ ...data.actions[0]!, title: 'Newest' }],
    });
    return newer.promise;
  });
  await act(() => {
    older.resolve(data);
    return older.promise;
  });
  expect(screen.queryByText('First')).toBeNull();
  expect(screen.getByText('Newest')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
test('initial error is not empty; nearby focus and visibility events are coalesced', async () => {
  const pending = deferred();
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockReturnValue(pending.promise);
  render(<Board load={load} />);
  await screen.findByRole('alert');
  expect(screen.queryByText(/No Actions yet/)).toBeNull();
  fireEvent.focus(window);
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await act(() => {
    pending.resolve({ ...data, actions: [] });
    return pending.promise;
  });
  expect(screen.getByText(/No Actions yet/)).toBeTruthy();
});

test.each(['success', 'failure'] as const)(
  'return during a pending refresh reads again after its %s without presenting the old result as current',
  async (outcome) => {
    vi.useFakeTimers();
    const older = deferred();
    const current = deferred();
    const load = vi
      .fn<() => Promise<BoardResponse>>()
      .mockResolvedValueOnce(data)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(current.promise);
    render(<Board load={load} />);
    await act(async () => {});
    const card = screen.getByText('First').closest('article');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {
      if (outcome === 'success') older.resolve({ ...data, actions: [] });
      else older.reject(new Error('Old read failed'));
      await older.promise.catch(() => undefined);
    });
    expect(load).toHaveBeenCalledTimes(3);
    expect(screen.getByText('First').closest('article')).toBe(card);
    expect(screen.getByRole('status').textContent).toBe('Refreshing…');
    expect(screen.queryByRole('alert')).toBeNull();
    await act(() => {
      current.resolve({
        ...data,
        actions: [{ ...data.actions[0]!, title: 'Changed through CLI' }],
      });
      return current.promise;
    });
    expect(screen.getByText('Changed through CLI').closest('article')).toBe(
      card,
    );
    expect(screen.getByRole('status').textContent).toContain('up to date');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(load).toHaveBeenCalledTimes(3);
  },
);
