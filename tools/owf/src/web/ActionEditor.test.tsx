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
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { BoardAction, BoardResponse } from '../contracts/index.js';
import { ActionEditor } from './ActionEditor.js';
import { fetchBoard } from './client.js';

vi.mock('./client.js', async (original) => ({
  ...(await original<typeof import('./client.js')>()),
  fetchBoard: vi.fn(),
  fetchOwners: () => Promise.resolve([]),
}));
const action: BoardAction = {
  id: 'source',
  title: 'Source',
  state: 'waiting',
  waiting_for: 'Reply',
  owner: { url: '/' },
  created_at: '2026-10-16T10:00:00.000Z',
  updated_at: '2026-10-16T10:00:00.000Z',
  depends_on: [],
  blocking: {
    blocked: false,
    manual: false,
    unresolved_dependencies: [],
    dependencies: [],
  },
};
const target: BoardAction = {
  ...action,
  id: 'target',
  title: 'Other project target',
  owner: { url: '/_projects/other/' },
  state: 'cancelled',
};
const response = (actions: BoardAction[]): BoardResponse => ({
  workspace: { root: '/work' },
  actions,
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
beforeEach(() => {
  vi.mocked(fetchBoard)
    .mockReset()
    .mockResolvedValue(response([target, action]));
});
afterEach(cleanup);
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
const candidates = () =>
  screen.getByRole('list', { name: 'Prerequisite candidates' });

test('manual and membership drafts preserve saved summary, literal reason, waiting context and one combined save', async () => {
  const save = vi.fn().mockResolvedValue(action);
  const onClose = vi.fn();
  render(
    <ActionEditor
      action={action}
      current={action}
      save={save}
      refresh={() => Promise.resolve(true)}
      onSaved={vi.fn()}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getByLabelText('Manually blocked'));
  submit();
  expect(
    await screen.findByText('Enter a nonblank manual blocking reason.'),
  ).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  change('Manual blocking reason', '  literal\nreason  ');
  fireEvent.click(screen.getByLabelText('Manually blocked'));
  expect(screen.queryByLabelText('Manual blocking reason')).toBeNull();
  fireEvent.click(screen.getByLabelText('Manually blocked'));
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Manual blocking reason').value,
  ).toBe('  literal\nreason  ');
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    within(candidates()).getByRole('button', { name: /Other project target/ }),
  );
  expect(screen.getByLabelText('Add prerequisite')).toBe(
    document.activeElement,
  );
  expect(
    screen.getByText('Pending addition · cancelled · Unresolved'),
  ).toBeTruthy();
  const savedSummary = screen.getByRole('region', { name: 'Saved blocking' });
  expect(within(savedSummary).getByText('Not blocked')).toBeTruthy();
  expect(within(savedSummary).queryByText('Other project target')).toBeNull();
  change('Title', 'Combined');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));
  submit();
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith('source', {
    expected: {
      title: action.title,
      owner: action.owner,
      state: action.state,
      waiting_for: 'Reply',
      updated_at: action.updated_at,
    },
    title: 'Combined',
    manualBlock: '  literal\nreason  ',
    addDependency: ['owf:action:target'],
  });
  expect(onClose).toHaveBeenCalledOnce();
});

test('net membership undo is a no-op and removal retains focus; existing membership can be restored', async () => {
  const uri = 'owf:action:target';
  const source = {
    ...action,
    depends_on: [uri],
    blocking: {
      blocked: true,
      manual: false,
      unresolved_dependencies: [uri],
      dependencies: [
        { uri, title: target.title, state: target.state, satisfied: false },
      ],
    },
  };
  const save = vi.fn();
  const onClose = vi.fn();
  render(
    <ActionEditor
      action={source}
      current={source}
      save={save}
      refresh={() => Promise.resolve(true)}
      onSaved={vi.fn()}
      onClose={onClose}
    />,
  );
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    screen.getByRole('button', { name: `Remove prerequisite ${uri}` }),
  );
  expect(screen.getByText('Pending removal')).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText('Add prerequisite'),
    ),
  );
  fireEvent.click(
    within(candidates()).getByRole('button', { name: /Other project target/ }),
  );
  // Self and terminal candidates remain selectable. Adding then removing is a no-op.
  fireEvent.click(within(candidates()).getByRole('button', { name: /Source/ }));
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove prerequisite owf:action:source',
    }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `Remove prerequisite ${uri}` }),
    ),
  );
  submit();
  expect(save).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});

test('search ignores superseded results, preserves selection on failure and retries without submitting', async () => {
  let old!: (result: BoardResponse) => void;
  vi.mocked(fetchBoard).mockImplementation((query) => {
    if (query?.search === 'old')
      return new Promise((resolve) => {
        old = resolve;
      });
    if (query?.search === 'broken')
      return Promise.reject(new Error('Store unavailable'));
    return Promise.resolve(response([target, action]));
  });
  const save = vi.fn();
  render(
    <ActionEditor
      action={action}
      current={action}
      save={save}
      refresh={() => Promise.resolve(true)}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    within(candidates()).getByRole('button', { name: /Other project target/ }),
  );
  change('Add prerequisite', 'old');
  change('Add prerequisite', 'new');
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  await act(async () => {
    old(response([]));
    await Promise.resolve();
  });
  expect(within(candidates()).getByText('Other project target')).toBeTruthy();
  change('Add prerequisite', 'broken');
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Lookup failed: Store unavailable',
  );
  expect(
    screen.getByRole('button', {
      name: 'Remove prerequisite owf:action:target',
    }),
  ).toBeTruthy();
  vi.mocked(fetchBoard).mockResolvedValue(response([action]));
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry prerequisite lookup' }),
  );
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.keyDown(screen.getByLabelText('Add prerequisite'), {
    key: 'Enter',
  });
  expect(within(candidates()).getByRole('button', { name: /Source/ })).toBe(
    document.activeElement,
  );
  expect(save).not.toHaveBeenCalled();
  expect(fetchBoard).toHaveBeenCalledWith({ search: 'new' });
});

test.each(['before selection', 'after selection'])(
  'new search facts survive an older Workspace lookup completing %s',
  async (completion) => {
    let finishLookup!: (result: BoardResponse) => void;
    const older = new Promise<BoardResponse>((resolve) => {
      finishLookup = resolve;
    });
    const corrected: BoardAction = {
      ...target,
      title: 'Corrected prerequisite',
      state: 'completed',
    };
    vi.mocked(fetchBoard).mockImplementation((query) =>
      query?.search ? Promise.resolve(response([corrected])) : older,
    );
    const save = vi.fn();
    render(
      <ActionEditor
        action={action}
        current={action}
        save={save}
        refresh={() => Promise.resolve(true)}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    change('Title', 'Preserved draft');
    change('Add prerequisite', 'Corrected');
    const candidate = await screen.findByRole('button', {
      name: /Corrected prerequisite completed/,
    });
    async function completeOlderLookup() {
      await act(async () => {
        finishLookup(response([target]));
        await older;
      });
    }
    if (completion === 'before selection') await completeOlderLookup();
    fireEvent.click(candidate);
    const row = screen
      .getByRole('button', {
        name: 'Remove prerequisite owf:action:target',
      })
      .closest('li')!;
    expect(within(row).getByText('Corrected prerequisite')).toBeTruthy();
    expect(
      within(row).getByText('Pending addition · completed · Satisfied'),
    ).toBeTruthy();
    if (completion === 'after selection') await completeOlderLookup();
    expect(within(row).getByText('Corrected prerequisite')).toBeTruthy();
    expect(
      within(row).getByText('Pending addition · completed · Satisfied'),
    ).toBeTruthy();
    // A later search that omits the selection cannot erase its observed facts.
    vi.mocked(fetchBoard).mockResolvedValue(response([]));
    change('Add prerequisite', 'No match');
    await screen.findByText('No Actions match this search.');
    expect(within(row).getByText('Corrected prerequisite')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
      'Preserved draft',
    );
    expect(save).not.toHaveBeenCalled();
  },
);

test('re-adding a saved edge uses newer search facts and retains them as stale after a failed refresh', async () => {
  const uri = 'owf:action:target';
  const source: BoardAction = {
    ...action,
    depends_on: [uri],
    blocking: {
      blocked: true,
      manual: false,
      unresolved_dependencies: [uri],
      dependencies: [
        { uri, title: target.title, state: target.state, satisfied: false },
      ],
    },
  };
  render(
    <ActionEditor
      action={source}
      current={source}
      save={vi.fn()}
      refresh={() => Promise.resolve(true)}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    screen.getByRole('button', { name: `Remove prerequisite ${uri}` }),
  );
  vi.mocked(fetchBoard).mockResolvedValue(
    response([{ ...target, title: 'Corrected target', state: 'completed' }]),
  );
  change('Add prerequisite', 'Corrected');
  fireEvent.click(
    await screen.findByRole('button', { name: /Corrected target completed/ }),
  );
  const row = screen
    .getByRole('button', { name: `Remove prerequisite ${uri}` })
    .closest('li')!;
  expect(within(row).getByText('Corrected target')).toBeTruthy();
  expect(
    within(row).getByText('Selected · completed · Satisfied'),
  ).toBeTruthy();
  vi.mocked(fetchBoard).mockRejectedValue(new Error('Unavailable'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh prerequisite lookup' }),
  );
  await screen.findByText('Lookup failed: Unavailable');
  expect(within(row).getByText('Corrected target')).toBeTruthy();
  expect(
    within(row).getByText('Selected · completed · Facts stale'),
  ).toBeTruthy();
  vi.mocked(fetchBoard).mockResolvedValue(
    response([{ ...target, title: 'Reopened target', state: 'open' }]),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry prerequisite lookup' }),
  );
  await within(row).findByText('Reopened target');
  expect(within(row).getByText('Selected · open · Unresolved')).toBeTruthy();
});

test('target-only refresh updates saved and unsaved facts without conflicting or discarding draft; failed facts are labeled stale', async () => {
  const uri = 'owf:action:target';
  const source: BoardAction = {
    ...action,
    depends_on: [uri],
    blocking: {
      blocked: true,
      manual: false,
      unresolved_dependencies: [uri],
      dependencies: [
        { uri, title: target.title, state: target.state, satisfied: false },
      ],
    },
  };
  const props = {
    action: source,
    current: source,
    save: vi.fn(),
    refresh: () => Promise.resolve(true),
    onSaved: vi.fn(),
    onClose: vi.fn(),
  };
  const { rerender } = render(<ActionEditor {...props} />);
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(within(candidates()).getByRole('button', { name: /Source/ }));
  change('Title', 'Draft title');
  fireEvent.click(screen.getByLabelText('Manually blocked'));
  change('Manual blocking reason', 'Draft reason');
  const next: BoardAction = {
    ...source,
    blocking: {
      blocked: false,
      manual: false,
      unresolved_dependencies: [],
      dependencies: [
        { uri, title: 'Corrected target', state: 'completed', satisfied: true },
      ],
    },
  };
  vi.mocked(fetchBoard).mockResolvedValue(
    response([{ ...action, title: 'Source corrected', state: 'completed' }]),
  );
  rerender(<ActionEditor {...props} current={next} />);
  await screen.findByText('Pending addition · completed · Satisfied');
  expect(
    within(screen.getByRole('region', { name: 'Saved blocking' })).getByText(
      'Corrected target',
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Draft title',
  );
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Manual blocking reason').value,
  ).toBe('Draft reason');
  expect(screen.queryByText(/This Action changed/)).toBeNull();
  vi.mocked(fetchBoard).mockRejectedValue(new Error('Unavailable'));
  rerender(<ActionEditor {...props} current={{ ...next }} />);
  await screen.findByText('Pending addition · completed · Facts stale');
  expect(
    screen
      .getByRole('button', { name: 'Save changes' })
      .hasAttribute('disabled'),
  ).toBe(false);
  // A real source revision change protects the same draft until explicit reload.
  rerender(
    <ActionEditor
      {...props}
      current={{
        ...next,
        updated_at: '2026-10-16T11:00:00.000Z',
        manual_block: 'External',
      }}
    />,
  );
  expect(screen.getByText(/This Action changed/)).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'Save changes' })
      .hasAttribute('disabled'),
  ).toBe(true);
});

test('terminal source shows satisfied and unresolved targets while manual editing is unavailable', () => {
  const source: BoardAction = {
    ...action,
    state: 'completed',
    blocking: {
      blocked: true,
      manual: false,
      unresolved_dependencies: ['owf:action:b'],
      dependencies: [
        {
          uri: 'owf:action:b',
          title: 'Cancelled target',
          state: 'cancelled',
          satisfied: false,
        },
        {
          uri: 'owf:action:a',
          title: 'Complete target',
          state: 'completed',
          satisfied: true,
        },
      ],
    },
    depends_on: ['owf:action:a', 'owf:action:b'],
  };
  render(
    <ActionEditor
      action={source}
      current={source}
      save={vi.fn()}
      refresh={() => Promise.resolve(true)}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByLabelText('Manually blocked').hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.getByText(/Completed and cancelled Actions cannot receive/),
  ).toBeTruthy();
  const summary = within(
    screen.getByRole('region', { name: 'Saved blocking' }),
  );
  expect(summary.getByText('completed · Satisfied')).toBeTruthy();
  expect(summary.getByText('cancelled · Unresolved')).toBeTruthy();
  expect(summary.getAllByRole('listitem')[0]?.textContent).toContain(
    'owf:action:a',
  );
});
