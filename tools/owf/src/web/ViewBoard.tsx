import { useEffect, useId, useRef, useState } from 'react';
import type {
  BoardAction,
  StoredView,
  ViewMoveRequest,
} from '../contracts/index.js';
import { ActionEditor, type EditorNavigation } from './ActionEditor.js';
import { ViewDragBoard } from './ViewDragBoard.js';
import { createViewAction, editBoardAction, moveViewAction } from './client.js';
import { ActionForm } from './ActionForm.js';
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
  const [creating, setCreating] = useState<string>();
  const addButtons = useRef(new Map<string, HTMLButtonElement>());
  const [pendingMove, setPendingMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reasonMove, setReasonMove] = useState<ViewMoveRequest>();
  const [reason, setReason] = useState('');
  const reasonHeadingId = useId();
  const reasonAction = useRef<string | undefined>(undefined);
  const [moveNotice, setMoveNotice] = useState<string>();
  const { data, loading, error, refresh, accept } = useView(
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
        ...(board.current?.querySelectorAll<HTMLElement>('[data-action-id]') ??
          []),
      ].find((element) => element.dataset['actionId'] === id);
      (card ?? refreshButton.current)?.focus();
    });
  }
  function cancel() {
    if (!alive.current || submitting.current) return;
    setReasonMove(undefined);
    frozen.current = false;
    setBusy(false);
    void refresh();
    focusCard(focused.current);
  }
  async function submit(input: ViewMoveRequest) {
    if (!alive.current || submitting.current) return;
    submitting.current = true;
    setPendingMove(true);
    lock();
    let notice: string;
    try {
      await moveViewAction(selected.id, input);
      notice = 'Move succeeded.';
    } catch (failure) {
      notice = failure instanceof Error ? failure.message : 'Move failed.';
    }
    if (!alive.current) return;
    setReasonMove(undefined);
    setMoveNotice(notice);
    frozen.current = false;
    await refresh();
    if (!alive.current) return;
    submitting.current = false;
    setPendingMove(false);
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
  const reasonDialog = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const focused = useRef<string | undefined>(undefined);
  const members = data?.columns.flatMap((column) => column.members) ?? [];
  useEffect(() => {
    if (pendingMove) reasonDialog.current?.focus();
  }, [pendingMove]);
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
        {navigation(editorNavigation, busy || !!creating)}
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
          disabled={busy || !!creating}
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
      {moveNotice && (
        <p role="status">
          {moveNotice}
          {loading
            ? ' Checking current View membership…'
            : error
              ? ' Display could not be refreshed; movement and saves are disabled until refresh succeeds.'
              : ''}
        </p>
      )}
      {data && (
        <div
          ref={board}
          onFocusCapture={(event) => {
            focused.current =
              (event.target as HTMLElement)
                .closest('[data-action-id]')
                ?.getAttribute('data-action-id') ?? focused.current;
          }}
        >
          <ViewDragBoard
            creation={(column) =>
              column.default_status && column.id !== data.blocked_column ? (
                <>
                  <button
                    ref={(node) => {
                      if (node) addButtons.current.set(column.id, node);
                    }}
                    type="button"
                    aria-expanded={creating === column.id}
                    className={styles.add}
                    disabled={
                      busy || !!detail || !!error || loading || !!creating
                    }
                    onClick={() => {
                      frozen.current = true;
                      setCreating(column.id);
                    }}
                  >
                    + Add Action
                  </button>
                  {creating === column.id && (
                    <ActionForm
                      state={column.default_status}
                      label={column.title}
                      save={(input) =>
                        createViewAction(selected.id, {
                          ...input,
                          column: column.id,
                          expected_definition: data.creation_definition!,
                        })
                      }
                      onSaved={(action) => {
                        frozen.current = false;
                        accept((current) => ({
                          ...current,
                          columns: current.columns.map((c) =>
                            c.id === column.id
                              ? { ...c, members: [...c.members, action] }
                              : c,
                          ),
                        }));
                        setSaved(action);
                        void refresh();
                      }}
                      onClose={() => {
                        frozen.current = false;
                        setCreating(undefined);
                        requestAnimationFrame(() => {
                          const add = addButtons.current.get(column.id);
                          (add?.disabled
                            ? refreshButton.current
                            : add
                          )?.focus();
                        });
                      }}
                    />
                  )}
                </>
              ) : null
            }
            data={data}
            disabled={
              !!error ||
              loading ||
              !!detail ||
              !!reasonMove ||
              pendingMove ||
              !!creating
            }
            onOpen={(action) => {
              if (!creating && !busy && !frozen.current && !submitting.current)
                setDetail(action);
            }}
            onStart={(id) => {
              if (alive.current && !submitting.current) lock(id);
            }}
            onCancel={cancel}
            onDrop={drop}
          />
        </div>
      )}
      {reasonMove && (
        <div className={styles.reasonBackdrop}>
          <section
            ref={reasonDialog}
            tabIndex={-1}
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
                    'textarea:not(:disabled), button:not(:disabled)',
                  ),
                ];
                if (controls.length === 0) {
                  event.preventDefault();
                  event.currentTarget.focus();
                } else if (
                  event.shiftKey &&
                  document.activeElement === controls[0]
                ) {
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
            <h2 id={reasonHeadingId}>Manual blocking reason</h2>
            {pendingMove && <p role="status">Submitting move…</p>}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim()) void submit({ ...reasonMove, reason });
              }}
            >
              <textarea
                aria-labelledby={reasonHeadingId}
                autoFocus
                rows={4}
                value={reason}
                disabled={pendingMove}
                onChange={(event) => setReason(event.target.value)}
              />
              <div className={styles.formButtons}>
                <button disabled={!reason.trim() || pendingMove}>
                  Confirm move
                </button>
                <button type="button" disabled={pendingMove} onClick={cancel}>
                  Cancel
                </button>
              </div>
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
          navigation={navigation(editorNavigation, busy || !!creating)}
          onDeleted={(id) => {
            accept((current) => ({
              ...current,
              columns: current.columns.map((c) => ({
                ...c,
                members: c.members.filter((a) => a.id !== id),
              })),
            }));
            setMoveNotice('Action deleted permanently.');
            void refresh();
          }}
          onSaved={(action) => {
            setSaved(action);
            void refresh();
          }}
          onClose={() => {
            setDetail(undefined);
            focusCard(detail.id);
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
