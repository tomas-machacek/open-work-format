// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { AvailableOwner, BoardAction } from '../contracts/index.js';
import { ActionForm } from './ActionForm.js';
import { ActionEditor } from './ActionEditor.js';
import { fetchOwners } from './client.js';

vi.mock('./client.js', async (original) => ({
  ...(await original<typeof import('./client.js')>()),
  fetchOwners: vi.fn(),
}));
const owners: AvailableOwner[] = [
  { url: '/', title: 'Local work', hierarchy: 'Workspace', type: 'workspace' },
  {
    url: '/_projects/alpha/ready/',
    title: 'Ready',
    hierarchy: 'Local work / Alpha',
    type: 'outcome',
  },
  {
    url: '/_projects/beta/ready/',
    title: 'Ready',
    hierarchy: 'Local work / Beta',
    type: 'outcome',
  },
];
const action: BoardAction = {
  id: 'identity',
  title: 'Original',
  owner: { url: '/_projects/missing/' },
  state: 'waiting',
  waiting_for: 'Reply',
  description: 'Notes',
  created_at: 'before',
  updated_at: 'now',
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
beforeEach(() => {
  vi.mocked(fetchOwners).mockReset().mockResolvedValue(owners);
});
afterEach(cleanup);
function deferred() {
  let resolve!: (value: AvailableOwner[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<AvailableOwner[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function form(mode: 'create' | 'edit') {
  const save = vi
    .fn()
    .mockRejectedValue(new Error('Selected owner became invalid.'));
  const close = vi.fn();
  const view = render(
    mode === 'create' ? (
      <ActionForm
        state="waiting"
        label="Waiting"
        save={save}
        onSaved={vi.fn()}
        onClose={close}
      />
    ) : (
      <ActionEditor
        action={action}
        current={action}
        save={save}
        refresh={() => Promise.resolve(true)}
        onSaved={vi.fn()}
        onClose={close}
      />
    ),
  );
  return { ...view, save, close };
}

test.each(['create', 'edit'] as const)(
  '%s searches names, hierarchy and URLs; only explicit selection changes the canonical owner',
  async (mode) => {
    const { save, close } = form(mode);
    await screen.findByText('3 owners found.');
    const input = screen.getByRole('combobox', { name: 'Owner' });
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Draft' },
    });
    fireEvent.change(input, { target: { value: 'READY' } });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: mode === 'create' ? 'Save' : 'Save changes',
      }),
    );
    await screen.findByText('Selected owner became invalid.');
    if (mode === 'create')
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({ owner: '/' }),
      );
    else expect(save.mock.calls[0]?.[1]).not.toHaveProperty('owner');
    fireEvent.change(input, { target: { value: 'local work / beta' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const option = screen.getByRole('option');
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(close).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '/_projects/beta/' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText(/Selected: Ready/).textContent).toContain(
      '/_projects/beta/ready/',
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: mode === 'create' ? 'Save' : 'Save changes',
      }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]?.[mode === 'create' ? 0 : 1]).toMatchObject({
      title: 'Draft',
      owner: '/_projects/beta/ready/',
    });
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
      'Draft',
    );
  },
);

test.each(['create', 'edit'] as const)(
  '%s preserves all fields and selection across loading, failed refresh, retry and unavailable result',
  async (mode) => {
    const first = deferred();
    vi.mocked(fetchOwners).mockReturnValueOnce(first.promise);
    const { save } = form(mode);
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Draft title' },
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: '**Draft notes**' },
    });
    fireEvent.change(screen.getByLabelText(/Waiting for/), {
      target: { value: 'Draft reply' },
    });
    expect(screen.getByText('Loading owners…')).toBeTruthy();
    await act(async () => {
      first.resolve(owners);
      await first.promise;
    });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Alpha' } });
    fireEvent.pointerDown(screen.getByRole('option'), { pointerType: 'touch' });
    fireEvent.click(screen.getByRole('option'));
    const refresh = deferred();
    vi.mocked(fetchOwners).mockReturnValueOnce(refresh.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh owners' }));
    expect(screen.getByText(/Selected: Ready/).textContent).toContain(
      '/_projects/alpha/ready/',
    );
    await act(async () => {
      refresh.reject(new Error('Cannot read README'));
      await refresh.promise.catch(() => {});
    });
    expect(screen.getByRole('alert').textContent).toBe('Cannot read README');
    expect(screen.queryByText(/Selected owner is unavailable/)).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
    vi.mocked(fetchOwners).mockResolvedValueOnce([owners[0]!]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry owners' }));
    await screen.findByText(/Selected owner is unavailable/);
    expect(
      screen.getByText(/Selected: \/_projects\/alpha\/ready\//u),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe(
      'Draft title',
    );
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(/Description/).value,
    ).toBe('**Draft notes**');
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(/Waiting for/).value,
    ).toBe('Draft reply');
    fireEvent.click(
      screen.getByRole('button', {
        name: mode === 'create' ? 'Save' : 'Save changes',
      }),
    );
    await screen.findByText('Selected owner became invalid.');
    expect(save.mock.calls[0]?.[mode === 'create' ? 0 : 1]).toMatchObject({
      owner: '/_projects/alpha/ready/',
      description: '**Draft notes**',
      waitingFor: 'Draft reply',
    });
  },
);

test('missing original owner remains visible and title-only save omits owner even when discovery fails', async () => {
  vi.mocked(fetchOwners).mockRejectedValueOnce(new Error('Discovery failed'));
  const { save } = form('edit');
  await screen.findByText('Discovery failed');
  expect(screen.getByText(/Selected: \/_projects\/missing\//u)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Renamed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save).toHaveBeenCalledWith(action.id, {
    expected: {
      title: action.title,
      owner: action.owner,
      state: action.state,
      waiting_for: action.waiting_for,
      description: action.description,
      updated_at: action.updated_at,
    },
    title: 'Renamed',
  });
});

test('later opening loads newly created owners; no matches leaves the current value untouched', async () => {
  const first = form('create');
  await screen.findByText('3 owners found.');
  first.unmount();
  vi.mocked(fetchOwners).mockResolvedValueOnce([
    ...owners,
    {
      url: '/_projects/new/',
      title: 'New project',
      hierarchy: 'Local work',
      type: 'project',
    },
  ]);
  const second = form('create');
  await screen.findByText('4 owners found.');
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'New project' },
  });
  fireEvent.click(screen.getByRole('option'));
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'no such owner' },
  });
  expect(screen.getByText(/No matches/)).toBeTruthy();
  expect(screen.getByText(/Selected: New project/)).toBeTruthy();
  expect(second.save).not.toHaveBeenCalled();
});
