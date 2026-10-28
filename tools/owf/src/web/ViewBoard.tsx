import { useEffect, useRef, useState } from 'react';
import type {
  BoardAction,
  StoredView,
  ViewMoveRequest,
} from '../contracts/index.js';
import { ActionEditor, type EditorNavigation } from './ActionEditor.js';
import { ViewDragBoard } from './ViewDragBoard.js';
import { editBoardAction, moveViewAction } from './client.js';
import { useView } from './useView.js';
import type { BoardNavigation } from './ViewSelector.js';
import styles from './Board.module.css';

export function ViewBoard({
  selected,
  navigation,
  onRefresh,
}: {
  selected: StoredView;
  navigation: BoardNavigation;
  onRefresh: () => void;
}) {
  const frozen = useRef(false);
  const alive = useRef(true);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [reasonMove, setReasonMove] = useState<ViewMoveRequest>();
  const [reason, setReason] = useState('');
  const reasonAction = useRef<string | undefined>(undefined);
  const [moveNotice, setMoveNotice] = useState<string>();
  const { data, loading, error, refresh } = useView(
    selected.id,
    onRefresh,
    undefined,
    frozen,
  );
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  function lock(id?: string) {
    if (id) focused.current = id;
    frozen.current = true;
    setBusy(true);
  }
  function focusCard(id?: string) {
    requestAnimationFrame(() => {
      const card = [
        ...document.querySelectorAll<HTMLElement>('[data-action-id]'),
      ].find((element) => element.dataset['actionId'] === id);
      (
        card?.querySelector<HTMLElement>('button') ?? refreshButton.current
      )?.focus();
    });
  }
  function cancel() {
    setReasonMove(undefined);
    frozen.current = false;
    setBusy(false);
    void refresh();
    focusCard(focused.current);
  }
  async function submit(input: ViewMoveRequest) {
    if (!alive.current || submitting.current) return;
    submitting.current = true;
    lock();
    let notice: string;
    try {
      await moveViewAction(selected.id, input);
      notice = 'Move succeeded.';
      setReasonMove(undefined);
    } catch (failure) {
      notice = failure instanceof Error ? failure.message : 'Move failed.';
      setReasonMove(undefined);
    }
    frozen.current = false;
    const fresh = await refresh();
    if (!alive.current) return;
    setMoveNotice(
      `${notice}${fresh ? '' : ' Display could not be refreshed; movement and saves are disabled until refresh succeeds.'}`,
    );
    submitting.current = false;
    setBusy(false);
    focusCard(input.action);
  }
  function drop(input: ViewMoveRequest) {
    if (!alive.current || submitting.current) return;
    const source = data?.columns.find((column) =>
      column.members.some((action) => action.id === input.action),
    );
    const action = source?.members.find((action) => action.id === input.action);
    if (
      source?.id !== input.column &&
      input.column === data?.blocked_column &&
      !action?.manual_block
    ) {
      if (reasonAction.current !== input.action) setReason('');
      reasonAction.current = input.action;
      setMoveNotice(undefined);
      setReasonMove(input);
      return;
    }
    void submit(input);
  }
  const [detail, setDetail] = useState<BoardAction>();
  const [saved, setSaved] = useState<BoardAction>();
  const editorNavigation = useRef<EditorNavigation>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const focused = useRef<string | undefined>(undefined);
  const members = data?.columns.flatMap((column) => column.members) ?? [];
  useEffect(() => {
    if (focused.current && document.activeElement === document.body) {
      const card = [
        ...(board.current?.querySelectorAll<HTMLElement>('[data-action-id]') ??
          []),
      ].find(
        (element) => element.getAttribute('data-action-id') === focused.current,
      );
      (card ?? refreshButton.current)?.focus();
    }
  }, [data]);
  const notice = saved
    ? `${saved.title}: saved successfully.${
        loading
          ? ' Checking current View membership…'
          : error
            ? ' Displayed membership could not be refreshed. Do not repeat the save.'
            : members.some((action) => action.id === saved.id)
              ? ''
              : ' The Action is no longer in the selected View.'
      }`
    : undefined;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          owf <span>/ workspace</span>
        </span>
        {navigation(editorNavigation, busy)}
      </header>
      <section
        className={`${styles.intro} ${styles.viewIntro}`}
        aria-labelledby="view-title"
      >
        <div>
          <p className={styles.eyebrow}>View</p>
          <h1 id="view-title">{data?.view.title ?? selected.title}</h1>
          <p className={styles.subtitle}>
            Shared Actions, organized by this View’s definition.
          </p>
        </div>
        <button
          disabled={busy}
          ref={refreshButton}
          onClick={() => {
            void refresh();
          }}
        >
          {error ? 'Retry' : 'Refresh'} <span aria-hidden="true">↻</span>
        </button>
      </section>
      <div className={styles.context}>
        <p>
          <span>Definition</span>
          {(data?.view ?? selected).definition.url}
        </p>
        <p role="status" aria-label="View refresh">
          {loading
            ? data
              ? 'Refreshing…'
              : 'Loading View…'
            : error
              ? data
                ? 'Stale · refresh failed'
                : 'Unable to load View'
              : `${members.length} Actions · up to date`}
        </p>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {data
            ? 'This View is stale. Saving is disabled until a successful refresh.'
            : 'View could not be loaded.'}{' '}
          {error} Use Retry or select Default Kanban.
        </div>
      )}
      {notice && (
        <p role="status" className={styles.scope}>
          {notice}
        </p>
      )}
      {data && !error && !loading && members.length === 0 && (
        <p className={styles.emptyBoard}>
          {data.columns.length === 0
            ? 'This View has no configured columns.'
            : 'No Actions are eligible for this View.'}
        </p>
      )}
      {moveNotice && <p role="status">{moveNotice}</p>}
      {data && (
        <div ref={board}>
          <ViewDragBoard
            data={data}
            disabled={
              !!error ||
              loading ||
              !!detail ||
              !!reasonMove ||
              submitting.current
            }
            onOpen={(action) => {
              if (!busy) setDetail(action);
            }}
            onStart={lock}
            onCancel={cancel}
            onDrop={drop}
          />
        </div>
      )}
      {reasonMove && (
        <div className={styles.reasonBackdrop}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Blocked reason"
            className={styles.editorCard}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !submitting.current) {
                event.preventDefault();
                cancel();
              }
              if (event.key === 'Tab') {
                const controls = [
                  ...event.currentTarget.querySelectorAll<HTMLElement>(
                    'textarea, button:not(:disabled)',
                  ),
                ];
                if (event.shiftKey && document.activeElement === controls[0]) {
                  event.preventDefault();
                  controls.at(-1)?.focus();
                } else if (
                  !event.shiftKey &&
                  document.activeElement === controls.at(-1)
                ) {
                  event.preventDefault();
                  controls[0]?.focus();
                }
              }
            }}
          >
            <h2>Manual blocking reason</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim()) void submit({ ...reasonMove, reason });
              }}
            >
              <label>
                Reason
                <textarea
                  autoFocus
                  value={reason}
                  disabled={submitting.current}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button disabled={!reason.trim() || submitting.current}>
                Confirm move
              </button>
              <button
                type="button"
                disabled={submitting.current}
                onClick={cancel}
              >
                Cancel
              </button>
            </form>
            {moveNotice && <p role="alert">{moveNotice}</p>}
          </section>
        </div>
      )}
      {detail && (
        <ActionEditor
          action={detail}
          current={members.find((action) => action.id === detail.id)}
          passive
          factsStale={!!error || loading || busy}
          save={editBoardAction}
          refresh={() => refresh()}
          navigationRef={editorNavigation}
          navigation={navigation(editorNavigation, busy)}
          onSaved={(action) => {
            setSaved(action);
            void refresh();
          }}
          onClose={() => {
            setDetail(undefined);
            requestAnimationFrame(() => {
              const card = [
                ...document.querySelectorAll<HTMLElement>('[data-action-id]'),
              ].find(
                (element) =>
                  element.getAttribute('data-action-id') === detail.id &&
                  element.closest('[aria-label="View board"]'),
              );
              (card ?? refreshButton.current)?.focus();
            });
          }}
        />
      )}
      <footer className={styles.footer}>
        Views display current membership. Edit shared Actions in detail. CLI
        changes appear when you return to this tab or refresh.
      </footer>
    </main>
  );
}
