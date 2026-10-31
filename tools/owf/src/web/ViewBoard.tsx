import type { ComponentProps } from 'react';
import {
  Notifications,
  NotificationSurface,
  useFeedback,
} from './Notifications.js';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

function ViewBoardContent({
  selected,
  navigation,
  onRefresh,
}: {
  selected: StoredView;
  navigation: BoardNavigation;
  onRefresh: (automatic?: boolean) => void;
}) {
  const feedback = useFeedback();
  const frozen = useRef(false);
  const alive = useRef(true);
  const submitting = useRef(false);
  const [creating, setCreating] = useState<string>();
  const creationFocus = useRef<string | undefined>(undefined);
  const addButtons = useRef(new Map<string, HTMLButtonElement>());
  const [pendingMove, setPendingMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reasonMove, setReasonMove] = useState<ViewMoveRequest>();
  const [reason, setReason] = useState('');
  const reasonHeadingId = useId();
  const reasonAction = useRef<string | undefined>(undefined);
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
    feedback.clear();
    let completed = false;
    try {
      await moveViewAction(selected.id, input);
      completed = true;
    } catch (failure) {
      if (alive.current) {
        const title =
          data?.columns
            .flatMap((column) => column.members)
            .find((action) => action.id === input.action)?.title ?? 'Action';
        feedback.report(
          `Move “${title}”: ${failure instanceof Error ? failure.message : 'Move failed.'}`,
        );
      }
    }
    if (!alive.current) return;
    setReasonMove(undefined);
    frozen.current = false;
    await refresh(true, completed ? 'Move' : undefined);
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
      feedback.clear();
      setReasonMove(input);
      return;
    }
    void submit(input);
  }
  const [detail, setDetail] = useState<BoardAction>();
  const editorNavigation = useRef<EditorNavigation>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const reasonDialog = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const focused = useRef<string | undefined>(undefined);
  const members = data?.columns.flatMap((column) => column.members) ?? [];
  useLayoutEffect(() => {
    if (creating || !creationFocus.current) return;
    const add = addButtons.current.get(creationFocus.current);
    const target = add && !add.disabled ? add : refreshButton.current;
    if (target && !target.disabled) {
      creationFocus.current = undefined;
      target.focus();
    }
  }, [creating]);
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
      {data && !error && !loading && members.length === 0 && (
        <p className={styles.emptyBoard}>
          {data.columns.length === 0
            ? 'This View has no configured columns.'
            : 'No Actions are eligible for this View.'}
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
                      feedback.clear();
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
                        void refresh(false, `Create “${action.title}”`);
                      }}
                      onClose={() => {
                        frozen.current = false;
                        creationFocus.current = column.id;
                        setCreating(undefined);
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
              if (
                !creating &&
                !busy &&
                !frozen.current &&
                !submitting.current
              ) {
                feedback.clear();
                setDetail(action);
              }
            }}
            onStart={(id) => {
              feedback.clear();
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
            <NotificationSurface />
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
          refresh={(automatic) => refresh(automatic)}
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
            void refresh(false, 'Deletion');
          }}
          onSaved={(action) => {
            accept((current) => ({
              ...current,
              columns: current.columns.map((column) => ({
                ...column,
                members: column.members.map((member) =>
                  member.id === action.id ? action : member,
                ),
              })),
            }));
            void refresh(false, `Save “${action.title}”`);
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

export function ViewBoard(props: ComponentProps<typeof ViewBoardContent>) {
  return (
    <Notifications>
      <ViewBoardContent {...props} />
    </Notifications>
  );
}
