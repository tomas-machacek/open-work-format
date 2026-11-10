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
import { Inbox as InboxContent } from './Inbox.js';
import { useInbox } from './useInbox.js';
import { Notifications } from './Notifications.js';
import {
  fetchInbox,
  fetchWorkspaceIdentity,
  writeInbox,
} from './inboxClient.js';
import { StateUpdateError } from './client.js';
import type { InboxItem } from '../contracts/index.js';

vi.mock('./inboxClient.js', () => ({
  fetchInbox: vi.fn(),
  fetchWorkspaceIdentity: vi.fn(),
  writeInbox: vi.fn(),
}));
const first: InboxItem = {
  id: '00000000-0000-4000-8000-000000000001',
  text: '  First\n[plain](https://example.com)\t',
  captured_at: '2026-11-07T10:00:00.000Z',
};
const second: InboxItem = {
  ...first,
  id: '00000000-0000-4000-8000-000000000002',
  text: 'Second',
};
const result = (items = [first, second], root = '/one') => ({
  workspace: { root },
  items,
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
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const capture = () => screen.getByLabelText('Capture a thought');
const typeCapture = (text: string) =>
  fireEvent.change(capture(), { target: { value: text } });
function Inbox() {
  return <InboxContent inbox={useInbox()} />;
}
async function start() {
  render(
    <Notifications>
      <Inbox />
    </Notifications>,
  );
  await screen.findByRole('button', { name: 'Hide Inbox (2)' });
}
async function open() {
  await start();
  fireEvent.click(within(screen.getByRole('list')).getAllByRole('button')[0]!);
  return screen.getByRole('dialog', { name: 'Inbox Item' });
}
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.mocked(fetchInbox).mockReset().mockResolvedValue(result());
  vi.mocked(fetchWorkspaceIdentity).mockReset().mockResolvedValue('/one');
  vi.mocked(writeInbox).mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('visibility persists per Workspace, capture survives toggling and unavailable browser storage', async () => {
  await start();
  typeCapture('Draft');
  fireEvent.click(button('Hide Inbox (2)'));
  expect((capture() as HTMLTextAreaElement).value).toBe('Draft');
  expect(screen.queryByRole('list')).toBeNull();
  cleanup();
  render(<Inbox />);
  await screen.findByRole('button', { name: 'Show Inbox (2)' });
  cleanup();
  vi.mocked(fetchInbox).mockResolvedValue(result(undefined, '/two'));
  vi.mocked(fetchWorkspaceIdentity).mockResolvedValue('/two');
  await start();
  expect(screen.getByRole('list')).toBeDefined();
  cleanup();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Disabled');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Disabled');
  });
  await start();
  fireEvent.click(button('Hide Inbox (2)'));
  vi.mocked(writeInbox).mockResolvedValue({
    ...second,
    id: 'new',
    text: 'Stored',
  });
  typeCapture('Stored');
  fireEvent.click(button('Add to Inbox'));
  await waitFor(() =>
    expect((capture() as HTMLTextAreaElement).value).toBe(''),
  );
  expect(screen.queryByRole('list')).toBeNull();
});

test('a failed first list read still restores visibility and does not advertise an empty Inbox or block capture', async () => {
  localStorage.setItem('owf:inbox:/one', 'false');
  vi.mocked(fetchInbox).mockRejectedValue(new Error('Read unavailable'));
  render(
    <Notifications>
      <Inbox />
    </Notifications>,
  );
  await screen.findByRole('button', { name: 'Show Inbox' });
  await screen.findByText(/Inbox not current/);
  expect(screen.queryByText('Inbox is empty.')).toBeNull();
  expect((button('Add to Inbox') as HTMLButtonElement).disabled).toBe(false);
  typeCapture('Retained thought');
  vi.mocked(writeInbox).mockResolvedValue({
    ...first,
    text: 'Retained thought',
  });
  fireEvent.click(button('Add to Inbox'));
  await waitFor(() =>
    expect((capture() as HTMLTextAreaElement).value).toBe(''),
  );
  expect(screen.queryByRole('list')).toBeNull();
});

test('blank capture is rejected; pending capture prevents duplicates, keeps newer input and confirms despite failed read', async () => {
  await start();
  typeCapture(' \n');
  fireEvent.click(button('Add to Inbox'));
  expect(writeInbox).not.toHaveBeenCalled();
  const pending = deferred<InboxItem | undefined>();
  vi.mocked(writeInbox).mockReturnValueOnce(pending.promise);
  const text = '\tŽivot\nhttps://example.com\n# literal';
  typeCapture(text);
  fireEvent.click(button('Add to Inbox'));
  expect((button('Add to Inbox') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(capture().closest('form')!);
  typeCapture('Newer input');
  vi.mocked(fetchInbox).mockRejectedValue(new Error('Offline'));
  await act(async () => {
    pending.resolve({ ...second, id: 'new', text });
    await pending.promise;
  });
  await screen.findByText('Inbox not current. Confirmed writes are retained.');
  expect((capture() as HTMLTextAreaElement).value).toBe('Newer input');
  expect(screen.getByRole('list').textContent).toContain(text);
  expect(writeInbox).toHaveBeenCalledTimes(1);
  // A rejected write retains the submitted draft without retrying.
  vi.mocked(writeInbox).mockRejectedValue(new Error('Store unavailable'));
  fireEvent.click(button('Add to Inbox'));
  await screen.findByText('Store unavailable');
  expect((capture() as HTMLTextAreaElement).value).toBe('Newer input');
});

test('a superseded read cannot resurrect a consumed item or replace confirmed edits and refresh does not overwrite drafts', async () => {
  const detail = await open();
  const read = deferred<ReturnType<typeof result>>();
  vi.mocked(fetchInbox).mockReturnValueOnce(read.promise);
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  const edit = within(detail).getByLabelText('Full Inbox text');
  fireEvent.change(edit, { target: { value: 'Changed' } });
  vi.mocked(writeInbox).mockResolvedValue({ ...first, text: 'Changed' });
  vi.mocked(fetchInbox).mockRejectedValue(new Error('Post-write read failed'));
  fireEvent.click(within(detail).getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Inbox not current. Confirmed writes remain saved.');
  await act(async () => {
    read.resolve(result());
    await read.promise;
  });
  expect((edit as HTMLTextAreaElement).value).toBe('Changed');
  expect(screen.getByRole('list').textContent).toContain('Changed');
  const oldRead = deferred<ReturnType<typeof result>>();
  vi.mocked(fetchInbox).mockReturnValueOnce(oldRead.promise);
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  vi.mocked(writeInbox).mockResolvedValue(undefined);
  vi.mocked(fetchInbox).mockRejectedValue(new Error('Offline'));
  fireEvent.click(within(detail).getByRole('button', { name: 'Resolve' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await act(async () => {
    oldRead.resolve(result());
    await oldRead.promise;
  });
  expect(screen.getByRole('list').textContent).not.toContain('Changed');
  expect(screen.getByRole('list').textContent).not.toContain(first.text);
});

test('editor guards Cancel and Escape, rejects blanks, retains failed saves and externally consumed unsaved text', async () => {
  const detail = await open();
  const edit =
    within(detail).getByLabelText<HTMLTextAreaElement>('Full Inbox text');
  expect(edit.value).toBe(first.text);
  expect(within(detail).queryByRole('link')).toBeNull();
  fireEvent.change(edit, { target: { value: ' ' } });
  fireEvent.click(within(detail).getByRole('button', { name: 'Save changes' }));
  expect(writeInbox).not.toHaveBeenCalled();
  expect(edit.value).toBe(' ');
  fireEvent.change(edit, { target: { value: 'Recover this draft' } });
  fireEvent.click(within(detail).getByRole('button', { name: 'Cancel' }));
  expect(
    within(detail).getByRole('group', { name: 'Unsaved changes' }),
  ).toBeDefined();
  fireEvent.click(button('Continue editing'));
  fireEvent(detail, new Event('cancel', { cancelable: true }));
  expect(button('Continue editing')).toBe(document.activeElement);
  fireEvent.click(button('Continue editing'));
  const pending = deferred<InboxItem | undefined>();
  vi.mocked(writeInbox).mockReturnValue(pending.promise);
  fireEvent.click(within(detail).getByRole('button', { name: 'Save changes' }));
  expect(edit.readOnly).toBe(true);
  expect((button('Resolve') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(edit.closest('form')!);
  expect(writeInbox).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.reject(new Error('Save failed'));
    await pending.promise.catch(() => undefined);
  });
  await screen.findByText('Save failed');
  expect(edit.value).toBe('Recover this draft');
  vi.mocked(fetchInbox).mockResolvedValue(result([second]));
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  await screen.findByText(/This Inbox Item is missing/);
  expect(edit.value).toBe('Recover this draft');
  expect(
    within(detail).getByRole<HTMLButtonElement>('button', {
      name: 'Save changes',
    }).disabled,
  ).toBe(true);
  expect((button('Resolve') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button('Cancel'));
  fireEvent.click(button('Discard changes'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('discard identifies the item, cancel is write-free and a pending consumption disables all affected controls', async () => {
  const detail = await open();
  fireEvent.click(button('Discard'));
  expect(detail.textContent).toContain(first.id);
  expect(button('Continue editing')).toBe(document.activeElement);
  fireEvent.click(button('Continue editing'));
  expect(writeInbox).not.toHaveBeenCalled();
  const pending = deferred<InboxItem | undefined>();
  vi.mocked(writeInbox).mockReturnValueOnce(pending.promise);
  fireEvent.click(button('Discard'));
  fireEvent.click(button('Confirm discard'));
  expect((button('Confirm discard') as HTMLButtonElement).disabled).toBe(true);
  expect((button('Continue editing') as HTMLButtonElement).disabled).toBe(true);
  fireEvent(detail, new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('dialog')).toBeDefined();
  vi.mocked(fetchInbox).mockResolvedValue(result([second]));
  await act(async () => {
    pending.resolve(undefined);
    await pending.promise;
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(writeInbox).toHaveBeenCalledExactlyOnceWith('discard', '', first.id);
  expect(capture()).toBe(document.activeElement);
});

test('a refreshed external replacement blocks unchanged save and consumption until the user inspects current text', async () => {
  const detail = await open();
  const edit =
    within(detail).getByLabelText<HTMLTextAreaElement>('Full Inbox text');
  vi.mocked(fetchInbox).mockResolvedValue(
    result([{ ...first, text: 'New external content' }, second]),
  );
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  await within(detail).findByText('New external content');
  expect(edit.value).toBe(first.text);
  for (const name of ['Save changes', 'Resolve', 'Discard']) {
    expect(
      within(detail).getByRole<HTMLButtonElement>('button', {
        name,
      }).disabled,
    ).toBe(true);
  }
  fireEvent.submit(edit.closest('form')!);
  expect(writeInbox).not.toHaveBeenCalled();
  // A failed later read must not clear a replacement already known to exist.
  vi.mocked(fetchInbox).mockRejectedValue(new Error('Read failed'));
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  await within(detail).findByText(
    'Inbox not current. Confirmed writes remain saved.',
  );
  expect((button('Resolve') as HTMLButtonElement).disabled).toBe(true);
  expect(
    (button('Replace draft with current text') as HTMLButtonElement).disabled,
  ).toBe(true);
  vi.mocked(fetchInbox).mockResolvedValue(
    result([{ ...first, text: 'New external content' }, second]),
  );
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  await waitFor(() =>
    expect(
      (button('Replace draft with current text') as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(button('Replace draft with current text'));
  expect(edit.value).toBe('New external content');
  expect(edit).toBe(document.activeElement);
  expect((button('Resolve') as HTMLButtonElement).disabled).toBe(false);
  expect(writeInbox).not.toHaveBeenCalled();
});

test('an external replacement preserves dirty text and requires deliberate reconciliation before saving it', async () => {
  const detail = await open();
  const edit =
    within(detail).getByLabelText<HTMLTextAreaElement>('Full Inbox text');
  fireEvent.change(edit, { target: { value: 'My unsaved draft' } });
  vi.mocked(fetchInbox).mockResolvedValue(
    result([{ ...first, text: 'External replacement' }, second]),
  );
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  await within(detail).findByText('External replacement');
  expect(edit.value).toBe('My unsaved draft');
  fireEvent.submit(edit.closest('form')!);
  expect(writeInbox).not.toHaveBeenCalled();
  fireEvent.click(button('Keep my draft for saving'));
  expect(edit.value).toBe('My unsaved draft');
  expect(edit).toBe(document.activeElement);
  expect((button('Resolve') as HTMLButtonElement).disabled).toBe(true);
  vi.mocked(writeInbox).mockResolvedValue({
    ...first,
    text: 'My unsaved draft',
  });
  vi.mocked(fetchInbox).mockResolvedValue(
    result([{ ...first, text: 'My unsaved draft' }, second]),
  );
  fireEvent.click(button('Save changes'));
  await waitFor(() =>
    expect((button('Resolve') as HTMLButtonElement).disabled).toBe(false),
  );
  expect(writeInbox).toHaveBeenCalledExactlyOnceWith(
    'save',
    'My unsaved draft',
    first.id,
  );
});

test('unknown write outcome blocks resubmission until a successful explicit reconciliation and inspection', async () => {
  await start();
  typeCapture('Possibly captured');
  vi.mocked(writeInbox).mockRejectedValue(
    new StateUpdateError('Unknown write', 'UNCERTAIN'),
  );
  fireEvent.click(button('Add to Inbox'));
  await screen.findByText(/Write outcome unknown/);
  expect((button('Add to Inbox') as HTMLButtonElement).disabled).toBe(true);
  expect(
    (button('I inspected Inbox; allow writes') as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.submit(capture().closest('form')!);
  expect(writeInbox).toHaveBeenCalledTimes(1);
  fireEvent.click(button('Refresh Inbox'));
  await waitFor(() =>
    expect(
      (button('I inspected Inbox; allow writes') as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(button('I inspected Inbox; allow writes'));
  expect(capture()).toBe(document.activeElement);
  expect((capture() as HTMLTextAreaElement).value).toBe('Possibly captured');
  expect((button('Add to Inbox') as HTMLButtonElement).disabled).toBe(false);
  expect(writeInbox).toHaveBeenCalledTimes(1);
});

test('unknown save retains the draft and offers current persisted text and reconciliation inside the modal', async () => {
  const detail = await open();
  const edit =
    within(detail).getByLabelText<HTMLTextAreaElement>('Full Inbox text');
  fireEvent.change(edit, { target: { value: 'Possibly saved draft' } });
  vi.mocked(writeInbox).mockRejectedValue(
    new StateUpdateError('Unknown save', 'UNCERTAIN'),
  );
  fireEvent.click(within(detail).getByRole('button', { name: 'Save changes' }));
  await within(detail).findByText(/Write outcome unknown/);
  expect(edit.value).toBe('Possibly saved draft');
  expect(
    within(detail).queryByRole('button', {
      name: 'I inspected Inbox; allow writes',
    }),
  ).toBeNull();
  vi.mocked(fetchInbox).mockResolvedValue(
    result([{ ...first, text: 'Actual persisted text' }, second]),
  );
  fireEvent.click(
    within(detail).getByRole('button', { name: 'Refresh Inbox' }),
  );
  await within(detail).findByText('Actual persisted text');
  expect(edit.value).toBe('Possibly saved draft');
  fireEvent.click(
    within(detail).getByRole('button', {
      name: 'I inspected Inbox; allow writes',
    }),
  );
  expect((button('Save changes') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button('Keep my draft for saving'));
  expect(
    within(detail).getByRole<HTMLButtonElement>('button', {
      name: 'Save changes',
    }).disabled,
  ).toBe(false);
  expect(writeInbox).toHaveBeenCalledTimes(1);
});

test('return events coalesce, hidden lists do not refresh automatically and opening reads CLI changes', async () => {
  await start();
  vi.useFakeTimers();
  const calls = vi.mocked(fetchInbox).mock.calls.length;
  fireEvent(window, new Event('focus'));
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(fetchInbox).toHaveBeenCalledTimes(calls + 1);
  fireEvent.click(button('Hide Inbox (2)'));
  fireEvent(window, new Event('focus'));
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(fetchInbox).toHaveBeenCalledTimes(calls + 1);
  vi.mocked(fetchInbox).mockResolvedValue(
    result([first, second, { ...second, id: 'external', text: 'From CLI' }]),
  );
  fireEvent.click(button('Show Inbox (2)'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('From CLI')).toBeDefined();
});
