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
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import { Board } from './Board.js';
import type {
  BoardResponse,
  BoardAction,
  CreateActionRequest,
  UpdateActionStateRequest,
  EditActionRequest,
  BoardQuery,
} from '../contracts/index.js';
import { StateUpdateError } from './client.js';
vi.mock('./client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client.js')>()),
  fetchOwners: () =>
    Promise.resolve([
      {
        url: '/',
        type: 'workspace',
        title: 'Workspace',
        hierarchy: 'Workspace',
      },
      {
        url: '/_projects/missing/',
        type: 'project',
        title: 'Stale owner',
        hierarchy: 'Workspace',
      },
    ]),
}));
let finishDrag: ((event: DragEndEvent) => void) | undefined;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      finishDrag = (event) => props.onDragEnd?.(event);
      return createElement(actual.DndContext, props);
    },
  };
});
function dropCard(id: string, state: string | null) {
  if (!finishDrag) throw new Error('Board drag context is unavailable.');
  act(() => {
    finishDrag!({
      active: { id },
      over: state === null ? null : { id: state },
    } as DragEndEvent);
  });
}
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
test('filter drafts apply explicitly; picker Enter selects only, recursion and Clear use distinct owner scope', async () => {
  const load = vi
    .fn<(query: BoardQuery) => Promise<BoardResponse>>()
    .mockResolvedValue(data);
  const save = vi.fn();
  const move = vi.fn();
  render(<Board load={load} save={save} move={move} />);
  await screen.findByText('First');
  const filters = screen.getByRole('form', { name: 'Board filters' });
  const search = within(filters).getByLabelText('Search title or description');
  fireEvent.change(search, { target: { value: '  literal  text  ' } });
  expect(screen.getByText('Unapplied filter changes')).toBeTruthy();
  const picker = within(filters).getByRole('combobox');
  fireEvent.focus(picker);
  fireEvent.change(picker, { target: { value: 'Workspace' } });
  await screen.findByRole('option', { name: /Workspace.*workspace/ });
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.keyDown(picker, { key: 'Enter' });
  expect(load).toHaveBeenCalledTimes(1);
  const checkbox = within(filters).getByRole<HTMLInputElement>('checkbox');
  expect(checkbox.disabled).toBe(false);
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  fireEvent.submit(filters);
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith({
      search: 'literal  text',
      owner: '/',
      recursive: true,
    }),
  );
  fireEvent.change(search, { target: { value: '   ' } });
  fireEvent.submit(filters);
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith({ owner: '/', recursive: true }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(load).toHaveBeenLastCalledWith({}));
  expect(checkbox.disabled).toBe(true);
  expect(checkbox.checked).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(move).not.toHaveBeenCalled();
});

test('superseded scope responses and Clear cannot replace latest selection; refresh preserves drafts', async () => {
  const first = deferred();
  const second = deferred();
  const load = vi
    .fn<(query: BoardQuery) => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockResolvedValue(data);
  render(<Board load={load} />);
  await screen.findByText('First');
  const filters = screen.getByRole('form', { name: 'Board filters' });
  const search = screen.getByLabelText('Search title or description');
  fireEvent.change(search, { target: { value: 'first query' } });
  fireEvent.submit(filters);
  expect(screen.getByText(/Previous results:/).textContent).toContain(
    'All text',
  );
  fireEvent.change(search, { target: { value: 'second query' } });
  fireEvent.submit(filters);
  await act(() => {
    second.resolve({ ...data, actions: [] });
    return second.promise;
  });
  await screen.findByText('No Actions match these filters');
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5);
  expect(
    screen
      .getAllByRole('button', { name: /Add Action/ })
      .every((button) => !(button as HTMLButtonElement).disabled),
  ).toBe(true);
  fireEvent.change(search, { target: { value: 'unsaved query' } });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(load).toHaveBeenLastCalledWith({ search: 'second query' }),
  );
  expect((search as HTMLInputElement).value).toBe('unsaved query');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await screen.findByText('First');
  await act(() => {
    first.resolve({ ...data, actions: [] });
    return first.promise;
  });
  expect(screen.getByText('First')).toBeTruthy();
  expect(screen.queryByText('No Actions match these filters')).toBeNull();
});

test.each([false, true])(
  'filtered creation confirms save separately from membership read failure=%s',
  async (fails) => {
    const load = vi
      .fn<(query: BoardQuery) => Promise<BoardResponse>>()
      .mockResolvedValue(data);
    const save = vi
      .fn<(input: CreateActionRequest) => Promise<BoardAction>>()
      .mockResolvedValue({ ...data.actions[0]!, id: 'new', title: 'Excluded' });
    render(<Board load={load} save={save} />);
    await screen.findByText('First');
    fireEvent.change(screen.getByLabelText('Search title or description'), {
      target: { value: 'First' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Board filters' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Board refresh' }).textContent,
      ).toContain('up to date'),
    );
    const form = openForm('Open');
    fireEvent.change(within(form).getByLabelText('Title'), {
      target: { value: 'Excluded' },
    });
    if (fails) load.mockRejectedValueOnce(new Error('Membership unavailable'));
    fireEvent.submit(form);
    await screen.findByText(
      fails
        ? /saved successfully.*refresh could not be confirmed/
        : /saved successfully but the Action does not match/,
    );
    expect(save).toHaveBeenCalledExactlyOnceWith({
      title: 'Excluded',
      owner: '/',
      state: 'open',
    });
    expect(document.querySelector('[data-action-id="new"]')).toBeNull();
  },
);

test('an editor retains drafts and an authoritative snapshot when filtered refresh excludes its card', async () => {
  let excluded = false;
  const load = vi.fn<(query: BoardQuery) => Promise<BoardResponse>>((query) =>
    Promise.resolve(query.search && excluded ? { ...data, actions: [] } : data),
  );
  const edit = vi
    .fn<(id: string, input: EditActionRequest) => Promise<BoardAction>>()
    .mockResolvedValue({ ...data.actions[0]!, title: 'Renamed' });
  render(<Board load={load} editAction={edit} />);
  await screen.findByText('First');
  fireEvent.change(screen.getByLabelText('Search title or description'), {
    target: { value: 'First' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Board filters' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByText('First'));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Title'), {
    target: { value: 'Renamed' },
  });
  excluded = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('No Actions match these filters');
  expect(within(dialog).getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Renamed',
  );
  expect(within(dialog).queryByText(/changed on the board/)).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await screen.findByText(/saved successfully but the Action does not match/);
  expect(edit).toHaveBeenCalledTimes(1);
});

test('a filtered read predating a confirmed move cannot resurrect the old snapshot; removed focus has a fallback', async () => {
  const old = deferred();
  const load = vi
    .fn<(query: BoardQuery) => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue({ ...data, actions: [] });
  const move = vi
    .fn<(id: string, input: UpdateActionStateRequest) => Promise<BoardAction>>()
    .mockResolvedValue({ ...data.actions[0]!, state: 'completed' });
  render(<Board load={load} move={move} />);
  await screen.findByText('First');
  const card = screen.getByText('First').closest('article')!;
  card.focus();
  fireEvent.change(screen.getByLabelText('Search title or description'), {
    target: { value: 'First' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Board filters' }));
  dropCard('one', 'completed');
  await screen.findByText('No Actions match these filters');
  await act(() => {
    old.resolve(data);
    return old.promise;
  });
  expect(screen.queryByText('First')).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Apply filters' }),
  );
});
test('pending filtered cards retain their observed snapshot only within the same result scope', async () => {
  let confirm!: (action: BoardAction) => void;
  const move = vi
    .fn<(id: string, input: UpdateActionStateRequest) => Promise<BoardAction>>()
    .mockReturnValue(
      new Promise((resolve) => {
        confirm = resolve;
      }),
    );
  const load = vi
    .fn<(query: BoardQuery) => Promise<BoardResponse>>()
    .mockResolvedValue(data);
  render(<Board load={load} move={move} />);
  await screen.findByText('First');
  const filters = screen.getByRole('form', { name: 'Board filters' });
  const search = screen.getByLabelText('Search title or description');
  fireEvent.change(search, { target: { value: 'First' } });
  fireEvent.submit(filters);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  dropCard('one', 'completed');
  load.mockResolvedValue({ ...data, actions: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(/previous card snapshots/);
  expect(screen.getByText('First')).toBeTruthy();
  expect(screen.queryByText('No Actions match these filters')).toBeNull();
  fireEvent.change(search, { target: { value: 'other selection' } });
  fireEvent.submit(filters);
  await screen.findByText('No Actions match these filters');
  expect(screen.queryByText('First')).toBeNull();
  await act(async () => {
    confirm({ ...data.actions[0]!, state: 'completed' });
    await Promise.resolve();
  });
  expect(screen.queryByText('First')).toBeNull();
});
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
  expect(openCard.getAttribute('tabindex')).toBe('0');
  expect(openCard.getAttribute('aria-describedby')).toBe('drag-instructions');
  expect(within(openCard).queryByRole('combobox')).toBeNull();
  expect(within(openCard).queryByRole('button')).toBeNull();
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
  return screen.getByRole('form', { name: /Add Action/ });
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
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: /Add Action/ })).toBeNull(),
    );
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
  fireEvent.focus(within(form).getByRole('combobox', { name: 'Owner' }));
  fireEvent.click(await screen.findByRole('option', { name: /Stale owner/ }));
  fireEvent.change(screen.getByLabelText(/Waiting for/), {
    target: { value: '  Reply  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Board refresh' }).textContent,
    ).toContain('up to date'),
  );
  expect(screen.getByRole('form', { name: /Add Action/ })).toBe(form);
  fireEvent.submit(form);
  await screen.findByText('Owner does not exist.');
  expect(save).toHaveBeenCalledWith({
    title: 'My draft',
    owner: '/_projects/missing/',
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
  expect(screen.queryByRole('form', { name: /Add Action/ })).toBeNull();
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
    .mockResolvedValueOnce({ ...data, actions: [...data.actions, created] })
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
  fireEvent.submit(screen.getByRole('form', { name: /Add Action/ }));
  await screen.findByText('Saved work');
  expect(screen.getByRole('alert').textContent).toContain('out of date');
  openForm();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Uncertain work' },
  });
  fireEvent.submit(screen.getByRole('form', { name: /Add Action/ }));
  await screen.findByText(/Save could not be confirmed/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  expect(save).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Uncertain work',
  );
  expect(screen.queryByText('Uncertain work')).toBeNull();
});

test('drop keeps the card visible while pending, then reconciles a confirmed move over an older GET', async () => {
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
  dropCard('one', 'waiting');
  expect(move).toHaveBeenCalledExactlyOnceWith('one', {
    state: 'waiting',
    expected: { state: 'open', updated_at: 'now' },
  });
  expect(
    within(screen.getByRole('region', { name: 'Open' })).getByText('First'),
  ).toBeTruthy();
  expect(within(card).getByText('Moving…')).toBeTruthy();
  expect(card.getAttribute('aria-disabled')).toBe('true');
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

test('same-column or outside drop writes nothing; conflict refreshes and uncertain result is not retried', async () => {
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
  dropCard('one', 'open');
  dropCard('one', null);
  expect(move).not.toHaveBeenCalled();
  dropCard('one', 'completed');
  await within(card).findByText('Action changed.');
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.getByText('First').closest('article')).toBe(card);
  dropCard('one', 'waiting');
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
  dropCard('one', 'waiting');
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

test('click and Enter open a focused detail, preserve draft on refresh, and require discard before closing', async () => {
  const load = vi.fn<() => Promise<BoardResponse>>().mockResolvedValue(data);
  render(<Board load={load} />);
  const card = (await screen.findByText('Waiting task')).closest('article')!;
  fireEvent.click(card);
  expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe(
    'editor-heading',
  );
  expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  expect(screen.getByLabelText<HTMLTextAreaElement>(/Waiting for/).value).toBe(
    'Supplier reply',
  );
  expect(screen.getByText('waiting')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'My draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'My draft',
  );
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true }),
  );
  expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Continue editing' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'My draft',
  );
  expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Continue editing' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(card));
  fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
  expect(screen.getByRole('dialog')).toBeTruthy();
});

test('edit sends one combined snapshot, reconciles confirmed card over an old read, and drag does not open detail', async () => {
  const oldRead = deferred();
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockReturnValueOnce(oldRead.promise)
    .mockResolvedValue({
      ...data,
      actions: [
        data.actions[0]!,
        data.actions[1]!,
        {
          ...data.actions[2]!,
          title: 'New title',
          description: 'Notes',
          waiting_for: undefined,
          updated_at: 'later',
        },
      ],
    });
  let confirm!: (action: BoardAction) => void;
  const edit = vi
    .fn<(id: string, input: EditActionRequest) => Promise<BoardAction>>()
    .mockReturnValue(
      new Promise((resolve) => {
        confirm = resolve;
      }),
    );
  const move = vi
    .fn<(id: string, input: UpdateActionStateRequest) => Promise<BoardAction>>()
    .mockResolvedValue({ ...data.actions[2]!, state: 'completed' });
  render(<Board load={load} editAction={edit} move={move} />);
  const card = (await screen.findByText('Waiting task')).closest('article')!;
  fireEvent.click(card);
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'New title' },
  });
  fireEvent.change(screen.getByLabelText(/Description/), {
    target: { value: 'Notes' },
  });
  fireEvent.change(screen.getByLabelText(/Waiting for/), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(edit).toHaveBeenCalledExactlyOnceWith('three', {
    expected: {
      title: 'Waiting task',
      owner: { url: '/' },
      state: 'waiting',
      waiting_for: 'Supplier reply',
      updated_at: 'before',
    },
    title: 'New title',
    description: 'Notes',
    clearWaitingFor: true,
  });
  expect(
    screen.getByRole('button', { name: 'Save changes' }).matches(':disabled'),
  ).toBe(true);
  await act(async () => {
    confirm({
      ...data.actions[2]!,
      title: 'New title',
      description: 'Notes',
      waiting_for: undefined,
      updated_at: 'later',
    });
    await Promise.resolve();
  });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(within(card).getByText('New title')).toBeTruthy();
  await act(() => {
    oldRead.resolve(data);
    return oldRead.promise;
  });
  expect(within(card).getByText('New title')).toBeTruthy();
  dropCard('three', 'completed');
  fireEvent.click(card);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('conflict keeps draft, refreshes current values and requires an explicit reload', async () => {
  const latest = {
    ...data.actions[2]!,
    title: 'Changed elsewhere',
    updated_at: 'later',
  };
  const load = vi
    .fn<() => Promise<BoardResponse>>()
    .mockResolvedValueOnce(data)
    .mockResolvedValue({
      ...data,
      actions: [data.actions[0]!, data.actions[1]!, latest],
    });
  const edit = vi
    .fn<(id: string, input: EditActionRequest) => Promise<BoardAction>>()
    .mockRejectedValue(
      new StateUpdateError('The Action changed.', 'ACTION_CONFLICT'),
    );
  render(<Board load={load} editAction={edit} />);
  fireEvent.click(
    (await screen.findByText('Waiting task')).closest('article')!,
  );
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'My draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('The Action changed.');
  await screen.findByText('Changed elsewhere');
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'My draft',
  );
  expect(
    screen.getByRole('button', { name: 'Save changes' }).matches(':disabled'),
  ).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload current values' }),
  );
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Changed elsewhere',
  );
  expect(edit).toHaveBeenCalledTimes(1);
});

test('empty description sends a clear, and an uncertain save keeps the draft until a fresh read is inspected', async () => {
  const existing = { ...data.actions[0]!, description: 'Old notes' };
  const current = { ...data, actions: [existing] };
  const load = vi.fn<() => Promise<BoardResponse>>().mockResolvedValue(current);
  const edit = vi
    .fn<(id: string, input: EditActionRequest) => Promise<BoardAction>>()
    .mockRejectedValue(
      new StateUpdateError('Save could not be confirmed.', 'UNCERTAIN'),
    );
  render(<Board load={load} editAction={edit} />);
  fireEvent.click((await screen.findByText('First')).closest('article')!);
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Draft' },
  });
  fireEvent.change(screen.getByLabelText(/Description/), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Save could not be confirmed.');
  expect(edit).toHaveBeenCalledWith(
    'one',
    expect.objectContaining({
      title: 'Draft',
      clearDescription: true,
    }),
  );
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Draft');
  expect(
    screen.getByRole('button', { name: 'Save changes' }).matches(':disabled'),
  ).toBe(true);
  expect(edit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Use current values' }));
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('First');
});
