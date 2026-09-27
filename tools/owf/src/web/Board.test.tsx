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
import type {
  BoardResponse,
  BoardAction,
  CreateActionRequest,
  UpdateActionStateRequest,
} from '../contracts/index.js';
import { StateUpdateError } from './client.js';
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
test('cards keep full text and semantic inline metadata without displaying IDs', async () => {
  const longTitle = 'Review ' + 'launch details '.repeat(12);
  const longOwner = '/_projects/' + 'long-segment/'.repeat(12);
  const reason = '  Approval from team\nWaiting for the final response  ';
  render(
    <Board
      load={() =>
        Promise.resolve({
          ...data,
          actions: [
            {
              ...data.actions[0]!,
              id: 'open-card-id',
              title: longTitle,
              owner: { url: longOwner },
            },
            { ...data.actions[2]!, id: 'waiting-card-id', waiting_for: reason },
            {
              ...data.actions[2]!,
              id: 'waiting-without-reason',
              title: 'No reason',
              waiting_for: undefined,
            },
          ],
        })
      }
    />,
  );
  const openCard = (
    await screen.findByRole('heading', { name: /Review launch details/ })
  ).closest('article')!;
  const waitingCard = screen.getByText('Waiting task').closest('article')!;
  const noReasonCard = screen.getByText('No reason').closest('article')!;
  expect(within(openCard).getByRole('heading').textContent).toBe(longTitle);
  expect(within(openCard).getByText(longOwner).textContent).toBe(longOwner);
  expect(within(openCard).getByText('Owner:').tagName).toBe('DT');
  expect(within(openCard).getByText(longOwner).tagName).toBe('DD');
  expect(within(waitingCard).getByText('Waiting for:').tagName).toBe('DT');
  const waitingValue = waitingCard.querySelectorAll('dd')[1];
  expect(waitingValue?.textContent).toBe(reason);
  expect(within(noReasonCard).queryByText('Waiting for:')).toBeNull();
  for (const [card, id] of [
    [openCard, 'open-card-id'],
    [waitingCard, 'waiting-card-id'],
    [noReasonCard, 'waiting-without-reason'],
  ] as const) {
    expect(card.textContent).not.toContain(id);
    expect(card.querySelectorAll('dt')).toHaveLength(
      card === waitingCard ? 2 : 1,
    );
  }
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
  expect(
    screen.getByRole('status', { name: 'Board refresh' }).textContent,
  ).toBe('Refreshing…');
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
    expect(
      screen.getByRole('status', { name: 'Board refresh' }).textContent,
    ).toBe('Refreshing…');
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
    expect(
      screen.getByRole('status', { name: 'Board refresh' }).textContent,
    ).toContain('up to date');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(load).toHaveBeenCalledTimes(3);
  },
);

function openForm(column = 'Waiting') {
  fireEvent.click(
    within(screen.getByRole('region', { name: column })).getByRole('button', {
      name: /Add Action/,
    }),
  );
  return screen.getByRole('form');
}
const created: BoardAction = {
  id: 'accepted',
  title: 'Saved work',
  state: 'waiting',
  owner: { url: '/_projects/launch/' },
  waiting_for: '  Reply  ',
  created_at: 'zz',
  updated_at: 'zz',
};

test.each(['Open', 'In Progress', 'Waiting', 'Completed', 'Cancelled'])(
  '%s form uses the column state, focuses title and defaults owner to Workspace',
  async (column) => {
    const save = vi
      .fn<(input: CreateActionRequest) => Promise<BoardAction>>()
      .mockResolvedValue(created);
    render(<Board load={() => Promise.resolve(data)} save={save} />);
    await screen.findByText('First');
    openForm(column);
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
    expect(screen.queryByLabelText(/Waiting for/) !== null).toBe(
      column === 'Waiting',
    );
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Work' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
    expect(save).toHaveBeenCalledWith({
      title: 'Work',
      owner: '/',
      state: column.toLowerCase().replace(' ', '_'),
    });
    expect(document.activeElement?.textContent).toContain('Add Action');
  },
);

test('draft survives validation, refresh and failed save, and Cancel restores focus', async () => {
  const save = vi
    .fn<(input: CreateActionRequest) => Promise<BoardAction>>()
    .mockRejectedValue(new Error('Owner does not exist.'));
  render(<Board load={() => Promise.resolve(data)} save={save} />);
  await screen.findByText('First');
  const form = openForm();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: '   ' },
  });
  fireEvent.submit(form);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Enter a title');
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'My draft' },
  });
  fireEvent.change(screen.getByLabelText(/Description/), {
    target: { value: '**Notes**' },
  });
  fireEvent.change(screen.getByLabelText('Owner URL'), {
    target: { value: '/missing/' },
  });
  fireEvent.change(screen.getByLabelText(/Waiting for/), {
    target: { value: '  Reply  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Board refresh' }).textContent,
    ).toContain('up to date'),
  );
  expect(screen.getByRole('form')).toBe(form);
  fireEvent.submit(form);
  await screen.findByText('Owner does not exist.');
  expect(save).toHaveBeenCalledWith({
    title: 'My draft',
    owner: '/missing/',
    description: '**Notes**',
    state: 'waiting',
    waitingFor: '  Reply  ',
  });
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'My draft',
  );
  expect(screen.getByLabelText<HTMLTextAreaElement>(/Description/).value).toBe(
    '**Notes**',
  );
  expect(screen.getByLabelText<HTMLTextAreaElement>(/Waiting for/).value).toBe(
    '  Reply  ',
  );
  expect(screen.queryByText('Saved work')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('form')).toBeNull();
  expect(document.activeElement?.textContent).toContain('Add Action');
});

test('pending create cannot duplicate; old GET cannot erase confirmation; subsequent GET reconciles by ID', async () => {
  const oldRead = deferred();
  let confirm!: (action: BoardAction) => void;
  const save = vi
    .fn<(input: CreateActionRequest) => Promise<BoardAction>>()
    .mockReturnValue(
      new Promise((resolve) => {
        confirm = resolve;
      }),
    );
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockReturnValueOnce(oldRead.promise)
    .mockResolvedValue({
      ...data,
      actions: [...data.actions, { ...created, state: 'completed' }],
    });
  render(<Board load={load} save={save} />);
  await screen.findByText('First');
  const card = screen.getByText('First').closest('article');
  const form = openForm();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Saved work' },
  });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Saving…' }).matches(':disabled'),
  ).toBe(true);
  expect(screen.queryByText('Saved work')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => {
    confirm(created);
    await Promise.resolve();
  });
  const savedCard = screen.getByText('Saved work').closest('article');
  expect(
    within(screen.getByRole('region', { name: 'Waiting' })).getAllByRole(
      'article',
    )[0],
  ).toBe(savedCard);
  await act(() => {
    oldRead.resolve(data);
    return oldRead.promise;
  });
  expect(screen.getAllByText('Saved work')).toHaveLength(1);
  expect(screen.getByText('Saved work').closest('article')).toBe(savedCard);
  expect(screen.getByText('First').closest('article')).toBe(card);
  expect(screen.getByRole('heading', { name: 'Waiting2' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Completed' })).getByText(
        'Saved work',
      ),
    ).toBeTruthy(),
  );
  expect(screen.getAllByText('Saved work')).toHaveLength(1);
});

test('confirmed create keeps stale warning until GET succeeds; uncertain failure retains draft without retry', async () => {
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockRejectedValue(new Error('Store unavailable'));
  const save = vi
    .fn<(input: CreateActionRequest) => Promise<BoardAction>>()
    .mockResolvedValueOnce(created)
    .mockRejectedValue(
      new Error(
        'Save could not be confirmed. Refresh and check the board before submitting again.',
      ),
    );
  render(<Board load={load} save={save} />);
  await screen.findByText('First');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('alert');
  openForm();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Saved work' },
  });
  fireEvent.submit(screen.getByRole('form'));
  await screen.findByText('Saved work');
  expect(screen.getByRole('alert').textContent).toContain('out of date');
  openForm();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Uncertain work' },
  });
  fireEvent.submit(screen.getByRole('form'));
  await screen.findByText(/Save could not be confirmed/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  expect(save).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Uncertain work',
  );
  expect(screen.queryByText('Uncertain work')).toBeNull();
});

test('Move to keeps the card visible while pending, then reconciles a confirmed move over an older GET', async () => {
  const oldRead = deferred();
  let confirm!: (action: BoardAction) => void;
  const move = vi
    .fn<(id: string, input: UpdateActionStateRequest) => Promise<BoardAction>>()
    .mockReturnValue(
      new Promise((resolve) => {
        confirm = resolve;
      }),
    );
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockReturnValueOnce(oldRead.promise)
    .mockResolvedValue({
      ...data,
      actions: [{ ...data.actions[0]!, state: 'completed' }],
    });
  render(<Board load={load} move={move} />);
  await screen.findByText('First');
  const card = screen.getByText('First').closest('article')!;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  fireEvent.change(
    within(card).getByRole('combobox', { name: 'Move First to' }),
    { target: { value: 'waiting' } },
  );
  expect(move).toHaveBeenCalledExactlyOnceWith('one', {
    state: 'waiting',
    expected: { state: 'open', updated_at: 'now' },
  });
  expect(
    within(screen.getByRole('region', { name: 'Open' })).getByText('First'),
  ).toBeTruthy();
  expect(within(card).getByText('Moving…')).toBeTruthy();
  expect(within(card).getByRole('combobox').hasAttribute('disabled')).toBe(
    true,
  );
  await act(async () => {
    confirm({ ...data.actions[0]!, state: 'waiting', updated_at: 'later' });
    await Promise.resolve();
  });
  expect(
    within(screen.getByRole('region', { name: 'Waiting' })).getByText('First'),
  ).toBeTruthy();
  await act(() => {
    oldRead.resolve(data);
    return oldRead.promise;
  });
  expect(screen.getAllByText('First')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Waiting2' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Completed' })).getByText(
        'First',
      ),
    ).toBeTruthy(),
  );
});

test('same-column selection writes nothing; conflict refreshes without speculative movement; uncertain result is not retried', async () => {
  const move = vi
    .fn<(id: string, input: UpdateActionStateRequest) => Promise<BoardAction>>()
    .mockRejectedValueOnce(
      new StateUpdateError('Action changed.', 'ACTION_CONFLICT'),
    )
    .mockRejectedValueOnce(
      new StateUpdateError('Check before retrying.', 'UNCERTAIN'),
    );
  const load = vi.fn<() => Promise<BoardResponse>>().mockResolvedValue(data);
  render(<Board load={load} move={move} />);
  const card = (await screen.findByText('First')).closest('article')!;
  const select = within(card).getByRole('combobox');
  fireEvent.change(select, { target: { value: 'open' } });
  expect(move).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: 'completed' } });
  await within(card).findByText('Action changed.');
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.getByText('First').closest('article')).toBe(card);
  fireEvent.change(select, { target: { value: 'waiting' } });
  await within(card).findByText('Check before retrying.');
  expect(move).toHaveBeenCalledTimes(2);
  expect(
    within(screen.getByRole('region', { name: 'Open' })).getByText('First'),
  ).toBeTruthy();
});

test('a read that finishes during a pending write does not move the source card early', async () => {
  const inFlight = deferred();
  let confirm!: (action: BoardAction) => void;
  const move = vi
    .fn<(id: string, input: UpdateActionStateRequest) => Promise<BoardAction>>()
    .mockReturnValue(
      new Promise((resolve) => {
        confirm = resolve;
      }),
    );
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockReturnValueOnce(inFlight.promise);
  render(<Board load={load} move={move} />);
  const card = (await screen.findByText('First')).closest('article')!;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  fireEvent.change(within(card).getByRole('combobox'), {
    target: { value: 'waiting' },
  });
  await act(() => {
    inFlight.resolve({
      ...data,
      actions: [{ ...data.actions[0]!, state: 'waiting' }],
    });
    return inFlight.promise;
  });
  expect(
    within(screen.getByRole('region', { name: 'Open' })).getByText('First'),
  ).toBeTruthy();
  expect(within(card).getByText('Moving…')).toBeTruthy();
  await act(async () => {
    confirm({ ...data.actions[0]!, state: 'waiting', updated_at: 'confirmed' });
    await Promise.resolve();
  });
  expect(
    within(screen.getByRole('region', { name: 'Waiting' })).getByText('First'),
  ).toBeTruthy();
});
