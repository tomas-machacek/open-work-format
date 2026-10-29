// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ViewBoard } from './ViewBoard.js';
import { useView } from './useView.js';
import {
  createViewAction,
  fetchOwners,
  fetchView,
  moveViewAction,
} from './client.js';
import type {
  BoardAction,
  ViewResponse,
  ViewMoveRequest,
} from '../contracts/index.js';
vi.mock('./client.js', async (original) => ({
  ...(await original<typeof import('./client.js')>()),
  fetchView: vi.fn(),
  createViewAction: vi.fn(),
  fetchOwners: vi.fn(),
  moveViewAction: vi.fn(),
}));
vi.mock('./ViewDragBoard.js', () => ({
  ViewDragBoard: ({
    onStart,
    onCancel,
    onDrop,
    disabled,
    data,
    creation,
  }: {
    data: ViewResponse;
    creation?: (column: ViewResponse['columns'][number]) => ReactNode;
    onStart: (id: string) => void;
    onCancel: () => void;
    onDrop: (input: ViewMoveRequest) => void;
    disabled: boolean;
  }) => (
    <div>
      {data.columns.map((column) => (
        <section key={column.id}>{creation?.(column)}</section>
      ))}
      <button disabled={disabled} onClick={() => onStart('a')}>
        Pick up
      </button>
      <button onClick={onCancel}>Escape drag</button>
      <button
        onClick={() => onDrop({ action: 'a', column: 'blocked', position: 1 })}
      >
        Drop blocked
      </button>
      <button
        onClick={() => onDrop({ action: 'a', column: 'next', position: 1 })}
      >
        Drop next
      </button>
    </div>
  ),
}));
const data: ViewResponse = {
  workspace: { root: '/w' },
  view: {
    id: 'v',
    title: 'View',
    created_at: 'now',
    definition: { url: '/v.md' },
  },
  blocked_column: 'blocked',
  columns: [
    {
      id: 'source',
      title: 'Source',
      members: [
        {
          id: 'a',
          title: 'A',
          state: 'open',
          owner: { url: '/' },
          created_at: 'now',
          updated_at: 'now',
          depends_on: [],
          blocking: {
            blocked: false,
            manual: false,
            unresolved_dependencies: [],
            dependencies: [],
          },
        },
      ],
    },
    { id: 'next', title: 'Next', members: [] },
    { id: 'blocked', title: 'Blocked', members: [] },
  ],
};
const inNext: ViewResponse = {
  ...data,
  columns: data.columns.map((column) => ({
    ...column,
    members:
      column.id === 'next'
        ? [
            {
              ...data.columns[0]!.members[0]!,
              state: 'in_progress',
              updated_at: 'later',
            },
          ]
        : [],
  })),
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function setup() {
  vi.mocked(fetchView).mockResolvedValue(data);
  render(
    <ViewBoard
      selected={data.view}
      onRefresh={() => {}}
      navigation={(_guard, disabled) => (
        <select aria-label="Display" disabled={disabled} />
      )}
    />,
  );
  await screen.findByText('1 Actions · up to date');
}

test('creation closes onto an enabled focus target even when a frame runs before React commits', async () => {
  // A frame can run before the state update enables the controls. Do not let
  // jsdom's scheduling accidentally guarantee that React always commits first.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  const initial: ViewResponse = {
    ...data,
    creation_definition: 'definition',
    columns: [{ ...data.columns[0]!, default_status: 'open' }],
  };
  let rejectRead!: (error: Error) => void;
  vi.mocked(fetchView)
    .mockResolvedValueOnce(initial)
    .mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRead = reject;
      }),
    );
  vi.mocked(fetchOwners).mockResolvedValue([]);
  let finish!: (action: BoardAction) => void;
  vi.mocked(createViewAction).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <ViewBoard
      selected={data.view}
      navigation={() => null}
      onRefresh={() => {}}
    />,
  );
  const add = await screen.findByRole<HTMLButtonElement>('button', {
    name: '+ Add Action',
  });
  await waitFor(() => expect(add.disabled).toBe(false));
  fireEvent.click(add);
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Created' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => {
    finish({
      ...data.columns[0]!.members[0]!,
      id: 'created',
      title: 'Created',
    });
    await Promise.resolve();
  });
  expect(
    screen.queryByRole('form', { name: 'Add Action to Source' }),
  ).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: /Refresh/ }),
  );
  await act(async () => {
    rejectRead(new Error('Read unavailable'));
    await Promise.resolve();
  });
  expect(screen.getByRole('alert').textContent).toContain('Read unavailable');
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: /Retry/ }),
  );
});
test('drag freezes tab refresh and navigation; reason cancellation never writes', async () => {
  await setup();
  fireEvent.click(screen.getByText('Pick up'));
  expect(screen.getByLabelText<HTMLSelectElement>('Display').disabled).toBe(
    true,
  );
  fireEvent.focus(window);
  await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
  expect(fetchView).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Drop blocked'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByText('Cancel'));
  await waitFor(() => expect(fetchView).toHaveBeenCalledTimes(2));
  expect(moveViewAction).not.toHaveBeenCalled();
});
test('required reason is sent once, confirmed commit followed by failed read disables movement', async () => {
  await setup();
  let confirm!: (value: Awaited<ReturnType<typeof moveViewAction>>) => void;
  vi.mocked(moveViewAction).mockReturnValue(
    new Promise((resolve) => {
      confirm = resolve;
    }),
  );
  const result = {
    source: 'source',
    destination: 'blocked',
    source_position: 1,
    destination_position: 1,
    changed: true,
    action: {
      ...data.columns[0]!.members[0]!,
      manual_block: 'Access',
      updated_at: 'later',
      blocking: {
        ...data.columns[0]!.members[0]!.blocking,
        blocked: true,
        manual: true,
      },
    },
  };
  vi.mocked(fetchView).mockRejectedValue(new Error('Read unavailable'));
  fireEvent.click(screen.getByText('Pick up'));
  fireEvent.click(screen.getByText('Drop blocked'));
  fireEvent.change(screen.getByLabelText('Manual blocking reason'), {
    target: { value: 'Access' },
  });
  fireEvent.click(screen.getByText('Confirm move'));
  fireEvent.click(screen.getByText('Confirm move'));
  expect(screen.getByText<HTMLButtonElement>('Confirm move').disabled).toBe(
    true,
  );
  expect(screen.getByText<HTMLButtonElement>('Cancel').disabled).toBe(true);
  expect(
    screen.getByLabelText<HTMLTextAreaElement>('Manual blocking reason')
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByText('Cancel'));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByText('Escape drag'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByLabelText<HTMLSelectElement>('Display').disabled).toBe(
    true,
  );
  expect(fetchView).toHaveBeenCalledTimes(1);
  await act(async () => {
    confirm(result);
    await Promise.resolve();
  });
  await screen.findByText(/Move succeeded.*Display could not be refreshed/);
  expect(moveViewAction).toHaveBeenCalledTimes(1);
  expect(moveViewAction).toHaveBeenCalledWith('v', {
    action: 'a',
    column: 'blocked',
    position: 1,
    reason: 'Access',
  });
  expect(screen.getByText<HTMLButtonElement>('Pick up').disabled).toBe(true);
  vi.mocked(fetchView).mockResolvedValue({
    ...data,
    columns: data.columns.map((column) => ({
      ...column,
      members: column.id === 'blocked' ? [result.action] : [],
    })),
  });
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  await screen.findByText('1 Actions · up to date');
  expect(screen.queryByText(/Display could not be refreshed/)).toBeNull();
  expect(screen.getByText<HTMLButtonElement>('Pick up').disabled).toBe(false);
  expect(screen.getByText('Move succeeded.')).toBeTruthy();
});
test('pending ordinary move rejects another gesture or cancellation and keeps navigation locked through refresh', async () => {
  await setup();
  let confirm!: (value: Awaited<ReturnType<typeof moveViewAction>>) => void;
  let read!: (value: ViewResponse) => void;
  vi.mocked(moveViewAction).mockReturnValue(
    new Promise((resolve) => {
      confirm = resolve;
    }),
  );
  vi.mocked(fetchView).mockReturnValueOnce(
    new Promise((resolve) => {
      read = resolve;
    }),
  );
  fireEvent.click(screen.getByText('Pick up'));
  fireEvent.click(screen.getByText('Drop next'));
  expect(screen.getByText<HTMLButtonElement>('Pick up').disabled).toBe(true);
  fireEvent.click(screen.getByText('Pick up'));
  fireEvent.click(screen.getByText('Escape drag'));
  fireEvent.click(screen.getByText('Drop next'));
  expect(screen.getByLabelText<HTMLSelectElement>('Display').disabled).toBe(
    true,
  );
  expect(moveViewAction).toHaveBeenCalledTimes(1);
  expect(fetchView).toHaveBeenCalledTimes(1);
  await act(async () => {
    confirm({
      source: 'source',
      destination: 'next',
      source_position: 1,
      destination_position: 1,
      changed: true,
      action: inNext.columns[1]!.members[0]!,
    });
    await Promise.resolve();
  });
  expect(screen.getByLabelText<HTMLSelectElement>('Display').disabled).toBe(
    true,
  );
  expect(screen.getByText<HTMLButtonElement>('Pick up').disabled).toBe(true);
  await act(async () => {
    read(inNext);
    await Promise.resolve();
  });
  expect(screen.getByLabelText<HTMLSelectElement>('Display').disabled).toBe(
    false,
  );
});

for (const fails of [false, true])
  test(`superseded post-move read does not report failure when queued refresh succeeds (failure=${fails})`, async () => {
    await setup();
    vi.mocked(moveViewAction).mockResolvedValue({
      source: 'source',
      destination: 'next',
      source_position: 1,
      destination_position: 1,
      changed: true,
      action: inNext.columns[1]!.members[0]!,
    });
    let finish!: (value: ViewResponse) => void;
    let fail!: (error: Error) => void;
    vi.mocked(fetchView)
      .mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
      )
      .mockResolvedValue(inNext);
    fireEvent.click(screen.getByText('Pick up'));
    fireEvent.click(screen.getByText('Drop next'));
    await waitFor(() => expect(fetchView).toHaveBeenCalledTimes(2));
    fireEvent.focus(window);
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    await act(async () => {
      if (fails) fail(new Error('Superseded read error'));
      else finish(data);
      await Promise.resolve();
    });
    await screen.findByText('1 Actions · up to date');
    expect(fetchView).toHaveBeenCalledTimes(3);
    expect(
      screen.queryByText(
        /Display could not be refreshed|Superseded read error/,
      ),
    ).toBeNull();
    expect(screen.getByText('Move succeeded.')).toBeTruthy();
    expect(moveViewAction).toHaveBeenCalledTimes(1);
  });
for (const message of [
  'Rejected by current definition',
  'Move outcome is unknown',
])
  test(`${message}: refresh facts without retry`, async () => {
    await setup();
    vi.mocked(moveViewAction).mockRejectedValue(new Error(message));
    fireEvent.click(screen.getByText('Pick up'));
    fireEvent.click(screen.getByText('Drop next'));
    await screen.findByText(message);
    expect(fetchView).toHaveBeenCalledTimes(2);
    expect(moveViewAction).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText<HTMLSelectElement>('Display').disabled).toBe(
      false,
    );
  });

for (const fails of [false, true])
  test(`read already in flight is deferred when touch activation freezes layout (failure=${fails})`, async () => {
    let finish!: (value: ViewResponse) => void;
    let fail!: (error: Error) => void;
    const pending = new Promise<ViewResponse>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const load = vi
      .fn()
      .mockResolvedValueOnce(data)
      .mockReturnValueOnce(pending)
      .mockResolvedValue(data);
    const frozen = { current: false };
    const inventory = vi.fn();
    const { result } = renderHook(() => useView('v', inventory, load, frozen));
    await waitFor(() => expect(result.current.data).toEqual(data));
    let reading!: Promise<boolean>;
    act(() => {
      reading = result.current.refresh();
    });
    frozen.current = true;
    await act(async () => {
      if (fails) fail(new Error('Superseded failure'));
      else finish({ ...data, columns: [] });
      await reading;
    });
    expect(result.current.data).toEqual(data);
    expect(result.current.error).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
    frozen.current = false;
    await act(async () => {
      await result.current.refresh();
    });
    expect(load).toHaveBeenCalledTimes(3);
    expect(result.current.loading).toBe(false);
  });

for (const mutation of ['create', 'delete']) {
  test(`confirmed ${mutation} survives a pre-write read and a failed follow-up read`, async () => {
    let finish!: (value: ViewResponse) => void;
    const load = vi.fn<() => Promise<ViewResponse>>().mockResolvedValue(data);
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useView('v', onRefresh, load));
    await waitFor(() => expect(result.current.data).toEqual(data));
    load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let reading!: Promise<boolean>;
    act(() => {
      reading = result.current.refresh();
    });
    act(() =>
      result.current.accept((current) => ({
        ...current,
        columns: current.columns.map((c) =>
          c.id === 'source'
            ? {
                ...c,
                members:
                  mutation === 'delete'
                    ? []
                    : [...c.members, { ...c.members[0]!, id: 'created' }],
              }
            : c,
        ),
      })),
    );
    await act(async () => {
      finish(data);
      await reading;
    });
    const known = result.current.data;
    expect(known!.columns[0]!.members).toHaveLength(
      mutation === 'delete' ? 0 : 2,
    );
    load.mockRejectedValueOnce(new Error('Refresh unavailable'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toEqual(known);
    expect(result.current.error).toBe('Refresh unavailable');
  });
}
