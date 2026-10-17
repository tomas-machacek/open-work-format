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
  // jsdom hides popovers by default but does not implement the top-layer API.
  // Real placement, clipping and scroll stability are covered in Chromium.
  HTMLElement.prototype.showPopover = function () {
    this.style.display = 'block';
  };
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
const openPicker = () =>
  fireEvent.click(screen.getByRole('button', { name: '+ Add prerequisite' }));
const candidates = () =>
  screen.getByRole('list', { name: 'Prerequisite candidates' });

const withTarget = (): BoardAction => ({
  ...action,
  depends_on: ['owf:action:target'],
  blocking: {
    blocked: true,
    manual: false,
    unresolved_dependencies: ['owf:action:target'],
    dependencies: [
      {
        uri: 'owf:action:target',
        title: target.title,
        state: target.state,
        satisfied: false,
      },
    ],
  },
});

test('one row retains a pending removal with Undo and saved summary until net membership is restored', async () => {
  const source = withTarget();
  const save = vi.fn();
  render(
    <ActionEditor
      action={source}
      current={source}
      save={save}
      refresh={() => Promise.resolve(true)}
      onSaved={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const list = screen.getByRole('list', { name: 'Prerequisites' });
  expect(
    screen.queryByRole('list', { name: 'Prerequisite candidates' }),
  ).toBeNull();
  await within(list).findByText('/_projects/other/');
  fireEvent.click(
    within(list).getByRole('button', {
      name: 'Remove prerequisite owf:action:target',
    }),
  );
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getByText('Removed')).toBeTruthy();
  expect(screen.getByText('Blocked · 1 prerequisite')).toBeTruthy();
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(
    within(list).getByRole('button', {
      name: 'Undo removal of prerequisite owf:action:target',
    }),
  );
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  submit();
  expect(save).not.toHaveBeenCalled();
});

test('closing an active picker ignores late responses and reopening starts clear without losing the draft', async () => {
  let finish!: (result: BoardResponse) => void;
  vi.mocked(fetchBoard).mockImplementation((query) =>
    query?.search === 'late'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(response([action, target])),
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
  change('Title', 'Keep draft');
  openPicker();
  expect(screen.getByLabelText('Add prerequisite')).toBe(
    document.activeElement,
  );
  change('Add prerequisite', 'late');
  fireEvent.keyDown(screen.getByLabelText('Add prerequisite'), {
    key: 'Escape',
  });
  expect(screen.queryByLabelText('Add prerequisite')).toBeNull();
  expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
  await act(async () => {
    finish(response([{ ...target, title: 'Late result' }]));
    await Promise.resolve();
  });
  expect(screen.queryByText('Late result')).toBeNull();
  openPicker();
  expect(
    screen.getByLabelText<HTMLInputElement>('Add prerequisite').value,
  ).toBe('');
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.pointerDown(screen.getByLabelText('Title'));
  expect(screen.queryByLabelText('Add prerequisite')).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
    'Keep draft',
  );
  expect(save).not.toHaveBeenCalled();
});

test('identity disambiguates equal titles/owners on focus, hover and click without selecting or submitting', async () => {
  const owner = '/_projects/%C5%BDlt%C3%BD%20projekt/';
  vi.mocked(fetchBoard).mockResolvedValue(
    response([
      { ...target, owner: { url: owner } },
      { ...target, id: 'duplicate', owner: { url: owner } },
    ]),
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
  openPicker();
  const list = await screen.findByRole('list', {
    name: 'Prerequisite candidates',
  });
  const labels = within(list).getAllByRole('button', {
    name: 'Identity for Other project target',
  });
  expect(within(list).getAllByText('/_projects/Žltý projekt/')).toHaveLength(2);
  fireEvent.focus(labels[0]!);
  expect(screen.getByRole('tooltip').textContent).toContain(
    'owf:action:target',
  );
  expect(screen.getByRole('tooltip').textContent).toContain(owner);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(screen.getByLabelText('Add prerequisite')).toBeTruthy();
  fireEvent.mouseEnter(labels[1]!.parentElement!);
  expect(screen.getByRole('tooltip').textContent).toContain(
    'owf:action:duplicate',
  );
  fireEvent.mouseLeave(labels[1]!.parentElement!);
  fireEvent.click(labels[1]!);
  expect(screen.getByRole('tooltip').textContent).toContain(
    'owf:action:duplicate',
  );
  fireEvent.click(labels[1]!);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.click(
    within(list).getByRole('button', {
      name: 'Add prerequisite owf:action:duplicate Other project target',
    }),
  );
  expect(
    screen.getByRole('button', {
      name: 'Remove prerequisite owf:action:duplicate',
    }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', {
      name: 'Remove prerequisite owf:action:target',
    }),
  ).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

test('owner loading/failure never guesses root and owner-less source projections retain a stale known owner', async () => {
  const source = withTarget();
  let fail!: (reason: Error) => void;
  vi.mocked(fetchBoard).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const props = {
    action: source,
    current: source,
    save: vi.fn(),
    refresh: () => Promise.resolve(true),
    onSaved: vi.fn(),
    onClose: vi.fn(),
  };
  const { rerender } = render(<ActionEditor {...props} />);
  const list = screen.getByRole('list', { name: 'Prerequisites' });
  expect(within(list).getByText(/Owner loading/)).toBeTruthy();
  expect(within(list).queryByText('/')).toBeNull();
  await act(async () => {
    fail(new Error('Offline'));
    await Promise.resolve();
  });
  expect(within(list).getByText(/Owner unavailable/)).toBeTruthy();
  expect(within(list).getByText(target.title)).toBeTruthy();
  expect(within(list).queryByText('/')).toBeNull();
  vi.mocked(fetchBoard).mockResolvedValue(response([target]));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
  await within(list).findByText('/_projects/other/');
  vi.mocked(fetchBoard).mockRejectedValue(new Error('Offline'));
  rerender(
    <ActionEditor
      {...props}
      current={{
        ...source,
        blocking: {
          ...source.blocking,
          dependencies: [
            {
              uri: 'owf:action:target',
              title: 'Fresh title',
              state: 'completed',
              satisfied: true,
            },
          ],
        },
      }}
    />,
  );
  await screen.findByText('Target facts stale/unavailable. Refresh to retry.');
  expect(within(list).getByText('Fresh title')).toBeTruthy();
  expect(within(list).getByText('/_projects/other/')).toBeTruthy();
  expect(within(list).getByText(/Owner stale/)).toBeTruthy();
  vi.mocked(fetchBoard).mockResolvedValue(
    response([{ ...target, owner: { url: '/_projects/new/' } }]),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
  await within(list).findByText('/_projects/new/');
  expect(within(list).queryByText(/Owner stale/)).toBeNull();
  expect(screen.queryByText(/This Action changed/)).toBeNull();
});

test.each(['source', 'target'])(
  'partial %s refresh failure stays honest, preserves pending rows/picker and can retry',
  async (failure) => {
    const source = withTarget();
    let finishSource!: (success: boolean) => void;
    const refresh = vi.fn<() => Promise<boolean>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSource = resolve;
        }),
    );
    const save = vi.fn();
    const props = {
      action: source,
      current: source,
      save,
      refresh,
      onSaved: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<ActionEditor {...props} />);
    await screen.findByText('/_projects/other/');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove prerequisite owf:action:target',
      }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', {
          name: 'Undo removal of prerequisite owf:action:target',
        }),
      ),
    );
    openPicker();
    await screen.findByRole('list', { name: 'Prerequisite candidates' });
    change('Add prerequisite', 'keep query');
    await screen.findByRole('list', { name: 'Prerequisite candidates' });
    let finishOlderLookup!: (result: BoardResponse) => void;
    if (failure === 'target')
      vi.mocked(fetchBoard)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishOlderLookup = resolve;
            }),
        )
        .mockRejectedValue(new Error('Offline'));
    else
      vi.mocked(fetchBoard).mockResolvedValue(
        response([{ ...target, owner: { url: '/new/' } }]),
      );
    const control = screen.getByRole('button', { name: 'Refresh blocking' });
    fireEvent.pointerDown(control);
    fireEvent.blur(screen.getByLabelText('Add prerequisite'), {
      relatedTarget: control,
    });
    fireEvent.click(control);
    fireEvent.click(control);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishSource(failure !== 'source');
      await Promise.resolve();
    });
    if (failure === 'target') {
      // A real successful source refresh supplies a new projection and starts
      // another target lookup. Its failure must survive the older success.
      rerender(
        <ActionEditor
          {...props}
          current={{
            ...source,
            blocking: {
              ...source.blocking,
              dependencies: source.blocking.dependencies.map((item) => ({
                ...item,
                title: 'Fresh target title',
              })),
            },
          }}
        />,
      );
      await screen.findByText(
        'Target facts stale/unavailable. Refresh to retry.',
      );
      await act(async () => {
        finishOlderLookup(response([target]));
        await Promise.resolve();
      });
      const rows = screen.getByRole('list', { name: 'Prerequisites' });
      expect(within(rows).getByText('Fresh target title')).toBeTruthy();
      expect(within(rows).getByText(/Owner stale/)).toBeTruthy();
    }
    const notice =
      failure === 'source'
        ? 'Saved facts stale/unavailable. Refresh to check current blocking.'
        : 'Target facts stale/unavailable. Refresh to retry.';
    await screen.findByText(notice);
    expect(screen.getByText('Removed')).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>('Add prerequisite').value,
    ).toBe('keep query');
    expect(screen.getByText('Blocked · 1 prerequisite')).toBeTruthy();
    vi.mocked(fetchBoard).mockResolvedValue(response([target]));
    refresh.mockResolvedValue(true);
    fireEvent.click(control);
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull());
    // Escape is scoped to the open picker even if focus leaves its subtree.
    act(() => control.focus());
    fireEvent.keyDown(control, { key: 'Escape' });
    expect(screen.queryByLabelText('Add prerequisite')).toBeNull();
    expect(screen.getByRole('button', { name: '+ Add prerequisite' })).toBe(
      document.activeElement,
    );
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  },
);

test.each(['before refresh', 'after refresh'])(
  'open candidates share refreshed observations when search completes %s',
  async (completion) => {
    const source = withTarget();
    const save = vi.fn();
    const refresh = vi.fn().mockResolvedValue(true);
    render(
      <ActionEditor
        action={source}
        current={source}
        save={save}
        refresh={refresh}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const selected = screen.getByRole('list', { name: 'Prerequisites' });
    await within(selected).findByText(target.title);
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Refresh blocking' })
          .hasAttribute('disabled'),
      ).toBe(false),
    );
    openPicker();
    await screen.findByRole('list', { name: 'Prerequisite candidates' });
    let finishSearch!: (result: BoardResponse) => void;
    const corrected = {
      ...target,
      title: 'Corrected prerequisite',
      state: 'completed' as const,
      owner: { url: '/_projects/corrected/' },
    };
    vi.mocked(fetchBoard).mockImplementation((query) =>
      query?.search
        ? new Promise((resolve) => {
            finishSearch = resolve;
          })
        : Promise.resolve(response([corrected])),
    );
    change('Add prerequisite', 'keep query');
    const completeSearch = () =>
      act(async () => {
        finishSearch(response([target]));
        await Promise.resolve();
      });
    if (completion === 'before refresh') await completeSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
    await within(selected).findByText(corrected.title);
    if (completion === 'after refresh') await completeSearch();
    const options = await screen.findByRole('list', {
      name: 'Prerequisite candidates',
    });
    expect(within(options).getByText(corrected.title)).toBeTruthy();
    expect(within(options).getByText(corrected.owner.url)).toBeTruthy();
    expect(within(options).getByText('completed')).toBeTruthy();
    expect(within(options).queryByText(target.title)).toBeNull();
    expect(within(selected).getByText('completed · Satisfied')).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>('Add prerequisite').value,
    ).toBe('keep query');
    // A failed refresh retains the same known candidate facts with stale labels.
    vi.mocked(fetchBoard).mockRejectedValue(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
    await screen.findByText(
      'Target facts stale/unavailable. Refresh to retry.',
    );
    expect(within(options).getByText(corrected.title)).toBeTruthy();
    expect(within(options).getByText(/Owner stale/)).toBeTruthy();
    expect(within(options).getByText('completed · Facts stale')).toBeTruthy();
    vi.mocked(fetchBoard).mockResolvedValue(response([corrected]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
    await waitFor(() =>
      expect(within(options).queryByText(/Owner stale/)).toBeNull(),
    );
    expect(within(options).getByText('completed')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  },
);

test('a complete lookup cannot revive an unavailable candidate from its old search result', async () => {
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
  openPicker();
  const options = await screen.findByRole('list', {
    name: 'Prerequisite candidates',
  });
  await within(options).findByText(target.title);
  vi.mocked(fetchBoard).mockResolvedValue(response([action]));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
  await within(options).findByText('Facts unavailable');
  expect(within(options).queryByText(target.title)).toBeNull();
  const unavailable = within(options).getByRole('button', {
    name: 'Add prerequisite owf:action:target Action unavailable',
  });
  expect(unavailable.hasAttribute('disabled')).toBe(true);
  fireEvent.click(unavailable);
  expect(screen.queryByText('Added')).toBeNull();
  expect(save).not.toHaveBeenCalled();
});

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
  fireEvent.click(screen.getByLabelText('Manual block'));
  submit();
  expect(
    await screen.findByText('Enter a nonblank manual blocking reason.'),
  ).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  change('Manual blocking reason', '  literal\nreason  ');
  fireEvent.click(screen.getByLabelText('Manual block'));
  expect(screen.queryByLabelText('Manual blocking reason')).toBeNull();
  fireEvent.click(screen.getByLabelText('Manual block'));
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Manual blocking reason').value,
  ).toBe('  literal\nreason  ');
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    within(candidates()).getByRole('button', {
      name: /Add prerequisite.*Other project target/,
    }),
  );
  expect(screen.getByRole('button', { name: '+ Add prerequisite' })).toBe(
    document.activeElement,
  );
  expect(screen.getByText('cancelled · Unresolved')).toBeTruthy();
  const savedSummary = screen.getByRole('region', { name: 'Blocking' });
  expect(within(savedSummary).getByText('Not blocked')).toBeTruthy();
  expect(
    within(savedSummary).getAllByText('Other project target'),
  ).toHaveLength(1);
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
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    screen.getByRole('button', { name: `Remove prerequisite ${uri}` }),
  );
  expect(screen.getByText('Removed')).toBeTruthy();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', {
        name: `Undo removal of prerequisite ${uri}`,
      }),
    ),
  );
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    within(candidates()).getByRole('button', {
      name: /Add prerequisite.*Other project target/,
    }),
  );
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  // Self and terminal candidates remain selectable. Adding then removing is a no-op.
  fireEvent.click(
    within(candidates()).getByRole('button', {
      name: /Add prerequisite.*Source/,
    }),
  );
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
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    within(candidates()).getByRole('button', {
      name: /Add prerequisite.*Other project target/,
    }),
  );
  openPicker();
  change('Add prerequisite', 'old');
  change('Add prerequisite', 'new');
  openPicker();
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
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.keyDown(screen.getByLabelText('Add prerequisite'), {
    key: 'Enter',
  });
  expect(
    within(candidates()).getByRole('button', {
      name: /Add prerequisite.*Source/,
    }),
  ).toBe(document.activeElement);
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
      owner: { url: '/_projects/corrected/' },
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
    openPicker();
    change('Add prerequisite', 'Corrected');
    const candidate = await screen.findByRole('button', {
      name: /Add prerequisite.*Corrected prerequisite/,
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
    expect(within(row).getByText('/_projects/corrected/')).toBeTruthy();
    expect(within(row).getByText('completed · Satisfied')).toBeTruthy();
    if (completion === 'after selection') await completeOlderLookup();
    expect(within(row).getByText('Corrected prerequisite')).toBeTruthy();
    expect(within(row).getByText('/_projects/corrected/')).toBeTruthy();
    expect(within(row).getByText('completed · Satisfied')).toBeTruthy();
    // A later search that omits the selection cannot erase its observed facts.
    vi.mocked(fetchBoard).mockResolvedValue(response([]));
    openPicker();
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
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    screen.getByRole('button', { name: `Remove prerequisite ${uri}` }),
  );
  vi.mocked(fetchBoard).mockResolvedValue(
    response([{ ...target, title: 'Corrected target', state: 'completed' }]),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', {
        name: `Undo removal of prerequisite ${uri}`,
      }),
    ),
  );
  openPicker();
  change('Add prerequisite', 'Corrected');
  fireEvent.click(
    await screen.findByRole('button', {
      name: /Add prerequisite.*Corrected target/,
    }),
  );
  const row = screen
    .getByRole('button', { name: `Remove prerequisite ${uri}` })
    .closest('li')!;
  expect(within(row).getByText('Corrected target')).toBeTruthy();
  expect(within(row).getByText('completed · Satisfied')).toBeTruthy();
  vi.mocked(fetchBoard).mockRejectedValue(new Error('Unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
  await screen.findByText('Target facts stale/unavailable. Refresh to retry.');
  expect(within(row).getByText('Corrected target')).toBeTruthy();
  expect(
    within(row).getByText('completed · Satisfied · Facts stale'),
  ).toBeTruthy();
  vi.mocked(fetchBoard).mockResolvedValue(
    response([{ ...target, title: 'Reopened target', state: 'open' }]),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh blocking' }));
  await within(row).findByText('Reopened target');
  expect(within(row).getByText('open · Unresolved')).toBeTruthy();
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
  openPicker();
  await screen.findByRole('list', { name: 'Prerequisite candidates' });
  fireEvent.click(
    within(candidates()).getByRole('button', {
      name: /Add prerequisite.*Source/,
    }),
  );
  change('Title', 'Draft title');
  fireEvent.click(screen.getByLabelText('Manual block'));
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
    response([
      { ...action, title: 'Source corrected', state: 'completed' },
      { ...target, title: 'Corrected target', state: 'completed' },
    ]),
  );
  rerender(<ActionEditor {...props} current={next} />);
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Remove prerequisite owf:action:source' })
        .closest('li')?.textContent,
    ).toContain('completed · Satisfied'),
  );
  expect(
    within(screen.getByRole('region', { name: 'Blocking' })).getByText(
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
  await screen.findByText('completed · Satisfied · Facts stale');
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
  expect(screen.getByLabelText('Manual block').hasAttribute('disabled')).toBe(
    true,
  );
  expect(
    screen.getByText(/Completed and cancelled Actions cannot receive/),
  ).toBeTruthy();
  const summary = within(screen.getByRole('region', { name: 'Blocking' }));
  expect(summary.getByText('completed · Satisfied')).toBeTruthy();
  expect(summary.getByText('cancelled · Unresolved')).toBeTruthy();
  expect(
    within(summary.getAllByRole('listitem')[0]!).getByRole('button', {
      name: 'Remove prerequisite owf:action:a',
    }),
  ).toBeTruthy();
});
