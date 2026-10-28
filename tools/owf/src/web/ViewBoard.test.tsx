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
import { ViewBoard } from './ViewBoard.js';
import { useView } from './useView.js';
import { fetchView, moveViewAction } from './client.js';
import type { ViewResponse, ViewMoveRequest } from '../contracts/index.js';
vi.mock('./client.js', async (original) => ({
  ...(await original<typeof import('./client.js')>()),
  fetchView: vi.fn(),
  moveViewAction: vi.fn(),
}));
vi.mock('./ViewDragBoard.js', () => ({
  ViewDragBoard: ({
    onStart,
    onCancel,
    onDrop,
    disabled,
  }: {
    onStart: () => void;
    onCancel: () => void;
    onDrop: (input: ViewMoveRequest) => void;
    disabled: boolean;
  }) => (
    <div>
      <button disabled={disabled} onClick={onStart}>
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
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
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
  vi.mocked(moveViewAction).mockResolvedValue({
    source: 'source',
    destination: 'blocked',
    source_position: 1,
    destination_position: 1,
    changed: true,
    action: data.columns[0]!.members[0]!,
  });
  vi.mocked(fetchView).mockRejectedValue(new Error('Read unavailable'));
  fireEvent.click(screen.getByText('Pick up'));
  fireEvent.click(screen.getByText('Drop blocked'));
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Access' },
  });
  fireEvent.click(screen.getByText('Confirm move'));
  fireEvent.click(screen.getByText('Confirm move'));
  await screen.findByText(/Move succeeded.*Display could not be refreshed/);
  expect(moveViewAction).toHaveBeenCalledTimes(1);
  expect(moveViewAction).toHaveBeenCalledWith('v', {
    action: 'a',
    column: 'blocked',
    position: 1,
    reason: 'Access',
  });
  expect(screen.getByText<HTMLButtonElement>('Pick up').disabled).toBe(true);
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
