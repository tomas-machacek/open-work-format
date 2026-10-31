// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  Notifications,
  NotificationSurface,
  useFeedback,
} from './Notifications.js';
import { useBoard } from './useBoard.js';
import { useView } from './useView.js';
import type { BoardResponse, ViewResponse } from '../contracts/index.js';

function Controls({ modal = false }: { modal?: boolean }) {
  const { clear, report } = useFeedback();
  return (
    <main>
      <button onClick={() => report('Move failed: Action changed.')}>
        Fail
      </button>
      <button onClick={() => report('Refresh failed: store unavailable.')}>
        Other error
      </button>
      <button onClick={clear}>New attempt</button>
      {modal && (
        <section aria-label="Active modal">
          <NotificationSurface />
        </section>
      )}
    </main>
  );
}
const advance = (ms: number) => {
  void act(() => vi.advanceTimersByTime(ms));
};
const fail = () => fireEvent.click(screen.getByText('Fail'));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('eight-second lifetime survives rerenders; identical failures and replacements get a fresh lifetime', () => {
  const { rerender, unmount } = render(
    <Notifications>
      <Controls />
    </Notifications>,
  );
  fail();
  advance(4000);
  rerender(
    <Notifications>
      <Controls />
    </Notifications>,
  );
  advance(3999);
  expect(screen.getByRole('alert').textContent).toContain('Move failed');
  advance(1);
  expect(screen.queryByRole('alert')).toBeNull();
  fail();
  advance(7000);
  fail();
  advance(1000);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  advance(6000);
  fireEvent.click(screen.getByText('Other error'));
  advance(1000);
  expect(screen.getByRole('alert').textContent).toContain('Refresh failed');
  advance(7000);
  expect(screen.queryByRole('alert')).toBeNull();
  fail();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('hover and focus pause together, then resume only the remaining lifetime; close restores focus without scrolling', () => {
  render(
    <Notifications>
      <Controls />
    </Notifications>,
  );
  const trigger = screen.getByText('Fail');
  trigger.focus();
  fail();
  expect(document.activeElement).toBe(trigger);
  advance(3000);
  const region = screen.getByLabelText('Operation error');
  const close = screen.getByRole('button', { name: 'Dismiss notification' });
  fireEvent.mouseEnter(region);
  act(() => close.focus());
  advance(20000);
  fireEvent.mouseLeave(region);
  advance(20000);
  expect(screen.getByRole('alert')).toBeTruthy();
  act(() => trigger.focus());
  advance(4999);
  expect(screen.getByRole('alert')).toBeTruthy();
  advance(1);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fail();
  act(() =>
    screen.getByRole('button', { name: 'Dismiss notification' }).focus(),
  );
  const restore = vi.spyOn(trigger, 'focus');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(restore).toHaveBeenCalledWith({ preventScroll: true });
  expect(document.activeElement).toBe(trigger);
  advance(8000);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('surface changes preserve remaining time and errors use the active modal; explicit attempts clear the old error', () => {
  const { rerender } = render(
    <Notifications>
      <Controls />
    </Notifications>,
  );
  fail();
  advance(5000);
  rerender(
    <Notifications>
      <Controls modal />
    </Notifications>,
  );
  expect(
    screen.getByLabelText('Active modal').contains(screen.getByRole('alert')),
  ).toBe(true);
  advance(2999);
  expect(screen.getByRole('alert')).toBeTruthy();
  advance(1);
  expect(screen.queryByRole('alert')).toBeNull();
  fail();
  fireEvent.click(screen.getByText('New attempt'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

const noop = () => {};
test('dismissing a hovered notification does not leave a later error paused', () => {
  render(
    <Notifications>
      <Controls />
    </Notifications>,
  );
  fail();
  fireEvent.mouseEnter(screen.getByLabelText('Operation error'));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  fail();
  advance(8000);
  expect(screen.queryByRole('alert')).toBeNull();
});

for (const mode of ['board', 'view'] as const) {
  test(`${mode}: background reads do not renew an unresolved failure, expiry preserves unavailable state, and explicit retry can report it again`, async () => {
    const load = vi.fn().mockRejectedValue(new Error('Unavailable'));
    function BoardRead() {
      const { error, refresh } = useBoard(load as () => Promise<BoardResponse>);
      return (
        <button
          onClick={() => {
            void refresh();
          }}
        >
          {error ? 'Unavailable · Retry' : 'Refresh'}
        </button>
      );
    }
    function ViewRead() {
      const { error, refresh } = useView(
        'a',
        noop,
        load as () => Promise<ViewResponse>,
      );
      return (
        <button
          onClick={() => {
            void refresh();
          }}
        >
          {error ? 'Unavailable · Retry' : 'Refresh'}
        </button>
      );
    }
    const { unmount } = render(
      <Notifications>
        {mode === 'board' ? <BoardRead /> : <ViewRead />}
      </Notifications>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toContain('Unavailable');
    advance(5000);
    fireEvent.focus(window);
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    advance(2900);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Unavailable · Retry')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('alert').textContent).toContain('Unavailable');
    advance(7999);
    expect(screen.getByRole('alert')).toBeTruthy();
    advance(1);
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
}
