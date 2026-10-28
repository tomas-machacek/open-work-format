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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Workspace } from './Workspace.js';
import {
  fetchBoard,
  fetchView,
  fetchViews,
  editBoardAction,
} from './client.js';
import type {
  BoardAction,
  StoredView,
  ViewResponse,
} from '../contracts/index.js';

vi.mock('./client.js', async (original) => ({
  ...(await original<typeof import('./client.js')>()),
  fetchBoard: vi.fn(),
  fetchView: vi.fn(),
  fetchViews: vi.fn(),
  editBoardAction: vi.fn(),
  fetchOwners: () =>
    Promise.resolve([
      {
        url: '/',
        title: 'Workspace',
        type: 'workspace',
        hierarchy: 'Workspace',
      },
    ]),
}));
const a: StoredView = {
  id: 'a',
  title: 'Same title',
  definition: { url: '/_views/board.md' },
  created_at: 'now',
};
const b: StoredView = { ...a, id: 'b' };
const action: BoardAction = {
  id: 'one',
  title: 'Shared Action',
  state: 'waiting',
  waiting_for: 'Reply',
  description: 'Full description',
  owner: { url: '/' },
  created_at: '2026-10-23T10:00:00Z',
  updated_at: '2026-10-23T10:00:00Z',
  depends_on: [],
  blocking: {
    blocked: false,
    manual: false,
    unresolved_dependencies: [],
    dependencies: [],
  },
};
const result = (view = a, members = [action]): ViewResponse => ({
  workspace: { root: '/work' },
  view,
  columns: [
    { id: 'active', title: 'Active', members },
    { id: 'empty', title: 'Empty', members: [] },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const select = (id: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: 'Display' }), {
    target: { value: id },
  });
async function start() {
  render(<Workspace />);
  await screen.findByRole('option', { name: 'Same title · a' });
}
async function openView() {
  await start();
  select('a');
  await screen.findByText('State · waiting');
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchViews).mockReset().mockResolvedValue([a, b]);
  vi.mocked(fetchView)
    .mockReset()
    .mockImplementation((id) => Promise.resolve(result(id === 'a' ? a : b)));
  vi.mocked(fetchBoard)
    .mockReset()
    .mockResolvedValue({ workspace: { root: '/work' }, actions: [action] });
  vi.mocked(editBoardAction).mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);

test('default filters are restored, never passed to View evaluation; duplicate instances, columns and full compact facts remain distinct', async () => {
  await start();
  fireEvent.change(screen.getByLabelText('Search title or description'), {
    target: { value: 'missing' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() =>
    expect(fetchBoard).toHaveBeenLastCalledWith({ search: 'missing' }),
  );
  select('b');
  await screen.findByText('State · waiting');
  expect(fetchView).toHaveBeenLastCalledWith('b');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(b.title);
  expect(
    screen
      .getAllByRole('heading', { level: 2 })
      .map((node) => node.textContent),
  ).toEqual(['Active1', 'Empty0']);
  expect(screen.queryByRole('form', { name: 'Board filters' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Add Action/ })).toBeNull();
  const card = screen.getByRole('article');
  expect(card.getAttribute('aria-roledescription')).toBeNull();
  expect(card.textContent).toContain('Reply');
  fireEvent.keyDown(card, { key: 'Enter' });
  const detail = screen.getByRole('dialog');
  expect(
    within(detail).getByLabelText<HTMLTextAreaElement>('Description (Markdown)')
      .value,
  ).toBe('Full description');
  fireEvent.click(within(detail).getByRole('button', { name: 'Cancel' }));
  select('');
  expect(
    screen.getByLabelText<HTMLInputElement>('Search title or description')
      .value,
  ).toBe('missing');
  await waitFor(() =>
    expect(fetchBoard).toHaveBeenLastCalledWith({ search: 'missing' }),
  );
});

test('A → B → Default ignores superseded successes and failures without displaying previous cards under new identity', async () => {
  const first = deferred<ViewResponse>();
  const second = deferred<ViewResponse>();
  vi.mocked(fetchView).mockImplementation((id) =>
    id === 'a' ? first.promise : second.promise,
  );
  await start();
  select('a');
  expect(screen.queryByRole('article')).toBeNull();
  select('b');
  expect(screen.queryByRole('article')).toBeNull();
  select('');
  await act(async () => {
    first.resolve(result());
    second.reject(new Error('Old failure'));
    await Promise.resolve();
  });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Default Kanban',
  );
  expect(screen.queryByText(/Old failure/)).toBeNull();
  expect(screen.getAllByRole('article')).toHaveLength(1);
});

test('failed inventory and first evaluation remain errors; empty inventory and zero columns are successful states', async () => {
  vi.mocked(fetchViews).mockRejectedValueOnce(
    new Error('Inventory unavailable'),
  );
  render(<Workspace />);
  await screen.findByText(/View inventory could not/);
  expect(screen.getByRole('option', { name: 'Default Kanban' })).toBeTruthy();
  vi.mocked(fetchViews).mockResolvedValueOnce([]);
  fireEvent.click(screen.getByRole('button', { name: 'Retry Views' }));
  await waitFor(() =>
    expect(screen.queryByText(/View inventory could not/)).toBeNull(),
  );
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByRole('option', { name: 'Same title · a' });
  vi.mocked(fetchView).mockRejectedValueOnce(new Error('Missing definition'));
  select('a');
  await screen.findByText(/View could not be loaded/);
  expect(screen.queryByRole('article')).toBeNull();
  vi.mocked(fetchView).mockResolvedValueOnce({ ...result(), columns: [] });
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  await screen.findByText('This View has no configured columns.');
  select('');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Default Kanban',
  );
});

test('same-View refresh retains stale content, prevents saves, retries, and coalesces tab-return inventory and evaluation reads', async () => {
  await openView();
  vi.mocked(fetchView).mockRejectedValueOnce(new Error('Definition broken'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(/This View is stale/);
  fireEvent.keyDown(screen.getByRole('article'), { key: 'Enter' });
  const detail = screen.getByRole('dialog');
  expect(
    within(detail).getByRole<HTMLButtonElement>('button', {
      name: 'Save changes',
    }).disabled,
  ).toBe(true);
  fireEvent.click(within(detail).getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  await waitFor(() =>
    expect(screen.queryByText(/This View is stale/)).toBeNull(),
  );
  const count = vi.mocked(fetchView).mock.calls.length;
  const inventoryCount = vi.mocked(fetchViews).mock.calls.length;
  fireEvent.focus(window);
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(fetchView).toHaveBeenCalledTimes(count + 1));
  expect(fetchViews).toHaveBeenCalledTimes(inventoryCount + 1);
});

test('dirty switch cancellation preserves selection and draft; pending save prevents switching; confirmed save reports failed refresh distinctly', async () => {
  await openView();
  fireEvent.click(screen.getByRole('article'));
  const detail = screen.getByRole('dialog');
  fireEvent.change(within(detail).getByLabelText('Title'), {
    target: { value: 'Edited' },
  });
  const switchMode = () =>
    fireEvent.change(
      within(detail).getByRole('combobox', { name: 'Display' }),
      { target: { value: '' } },
    );
  switchMode();
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Continue editing' }),
  );
  expect(within(detail).getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Edited',
  );
  expect(
    within(detail).getByRole<HTMLSelectElement>('combobox', {
      name: 'Display',
    }).value,
  ).toBe('a');
  const pending = deferred<BoardAction>();
  vi.mocked(editBoardAction).mockReturnValueOnce(pending.promise);
  fireEvent.click(within(detail).getByRole('button', { name: 'Save changes' }));
  switchMode();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(a.title);
  vi.mocked(fetchView).mockRejectedValueOnce(new Error('Read failed'));
  await act(async () => {
    pending.resolve({ ...action, title: 'Edited' });
    await Promise.resolve();
  });
  await screen.findByText(
    /saved successfully. Displayed membership could not be refreshed/,
  );
  expect(editBoardAction).toHaveBeenCalledTimes(1);
  select('');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Default Kanban',
  );
});

test('confirmed save re-evaluates membership without pinning or guessing and reports departure', async () => {
  await openView();
  fireEvent.click(screen.getByRole('article'));
  const detail = screen.getByRole('dialog');
  fireEvent.click(within(detail).getByLabelText('Manual block'));
  fireEvent.change(within(detail).getByLabelText('Manual blocking reason'), {
    target: { value: 'Outside scope' },
  });
  vi.mocked(editBoardAction).mockResolvedValueOnce({
    ...action,
    manual_block: 'Outside scope',
    blocking: { ...action.blocking, blocked: true, manual: true },
  });
  vi.mocked(fetchView).mockResolvedValueOnce(result(a, []));
  fireEvent.click(within(detail).getByRole('button', { name: 'Save changes' }));
  await screen.findByText(/no longer in the selected View/);
  expect(screen.queryByRole('article')).toBeNull();
  expect(vi.mocked(editBoardAction).mock.calls[0]?.[1]).toMatchObject({
    manualBlock: 'Outside scope',
  });
  expect(vi.mocked(editBoardAction).mock.calls[0]?.[1]).not.toHaveProperty(
    'view',
  );
});

test('confirming discard closes the editor and switches identity', async () => {
  await openView();
  fireEvent.click(screen.getByRole('article'));
  const detail = screen.getByRole('dialog');
  fireEvent.change(within(detail).getByLabelText('Title'), {
    target: { value: 'Draft' },
  });
  fireEvent.change(within(detail).getByRole('combobox', { name: 'Display' }), {
    target: { value: 'b' },
  });
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Discard changes' }),
  );
  await waitFor(() => expect(fetchView).toHaveBeenLastCalledWith('b'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(editBoardAction).not.toHaveBeenCalled();
});

test('tab return during a pending read queues a fresh read and ignores the pre-return error; inventory discovers new instances', async () => {
  await openView();
  const old = deferred<ViewResponse>();
  vi.mocked(fetchView).mockReturnValueOnce(old.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  const count = vi.mocked(fetchView).mock.calls.length;
  const inventoryCount = vi.mocked(fetchViews).mock.calls.length;
  fireEvent.focus(window);
  fireEvent(document, new Event('visibilitychange'));
  // Allow the shared focus/visibility debounce to register the queued return.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 130));
  });
  expect(fetchView).toHaveBeenCalledTimes(count);
  const next = { ...b, id: 'new', title: 'CLI-created View' };
  vi.mocked(fetchViews).mockResolvedValueOnce([a, b, next]);
  await act(async () => {
    old.reject(new Error('Superseded read failure'));
    await Promise.resolve();
  });
  await screen.findByRole('option', { name: 'CLI-created View' });
  expect(fetchView).toHaveBeenCalledTimes(count + 1);
  expect(fetchViews).toHaveBeenCalledTimes(inventoryCount + 1);
  expect(screen.queryByText(/Superseded read failure/)).toBeNull();
  expect(
    screen.getByRole<HTMLSelectElement>('combobox', { name: 'Display' }).value,
  ).toBe('a');
});

test('a disappeared instance stays explicitly selected with an error and an available default option', async () => {
  await openView();
  vi.mocked(fetchViews).mockResolvedValueOnce([b]);
  vi.mocked(fetchView).mockRejectedValueOnce(
    new Error('View instance a: No such stored View instance.'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(/No such stored View instance/);
  expect(
    screen.getByRole<HTMLSelectElement>('combobox', { name: 'Display' }).value,
  ).toBe('a');
  select('');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Default Kanban',
  );
});

test('default detail protects its draft when entering a View and does not reappear on return', async () => {
  await start();
  fireEvent.click(screen.getByRole('article'));
  const detail = screen.getByRole('dialog');
  fireEvent.change(within(detail).getByLabelText('Title'), {
    target: { value: 'Default draft' },
  });
  fireEvent.change(within(detail).getByRole('combobox', { name: 'Display' }), {
    target: { value: 'a' },
  });
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Continue editing' }),
  );
  expect(within(detail).getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Default draft',
  );
  fireEvent.change(within(detail).getByRole('combobox', { name: 'Display' }), {
    target: { value: 'a' },
  });
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Discard changes' }),
  );
  await screen.findByText('State · waiting');
  select('');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('detail navigation cannot bypass an open creation form or discard its draft', async () => {
  await start();
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Open' })).getByRole('button', {
      name: /Add Action/,
    }),
  );
  const form = screen.getByRole('form', { name: 'Add Action to Open' });
  fireEvent.change(within(form).getByLabelText('Title'), {
    target: { value: 'Creation draft' },
  });
  fireEvent.click(screen.getByRole('article'));
  const detail = screen.getByRole('dialog');
  const selector = within(detail).getByRole<HTMLSelectElement>('combobox', {
    name: 'Display',
  });
  expect(selector.disabled).toBe(true);
  // The navigation boundary must reject changes as well as disabling the UI.
  fireEvent.change(selector, { target: { value: 'a' } });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    'Default Kanban',
  );
  expect(fetchView).not.toHaveBeenCalled();
  fireEvent.click(within(detail).getByRole('button', { name: 'Cancel' }));
  expect(within(form).getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Creation draft',
  );
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('article'));
  const nextDetail = screen.getByRole('dialog');
  const nextSelector = within(nextDetail).getByRole<HTMLSelectElement>(
    'combobox',
    { name: 'Display' },
  );
  expect(nextSelector.disabled).toBe(false);
  fireEvent.change(nextSelector, { target: { value: 'a' } });
  await screen.findByText('State · waiting');
});
