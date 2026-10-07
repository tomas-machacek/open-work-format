import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ActionForm } from './ActionForm.js';
import {
  saveAction,
  StateUpdateError,
  updateActionState,
  editBoardAction,
} from './client.js';
import { ActionEditor } from './ActionEditor.js';
import { OwnerPicker } from './OwnerPicker.js';
import type {
  CreateActionRequest,
  BoardAction,
  BoardResponse,
  BoardQuery,
  UpdateActionStateRequest,
  EditActionRequest,
} from '../contracts/index.js';
import { useBoard } from './useBoard.js';
import { BoardColumn } from './BoardColumn.js';
import { MovableCard } from './MovableCard.js';
import styles from './Board.module.css';

const columns: [BoardAction['state'], string][] = [
  ['open', 'Open'],
  ['in_progress', 'In Progress'],
  ['waiting', 'Waiting'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];
const columnCollision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code))
    return undefined;
  event.preventDefault();
  const activeState: unknown = context.active?.data.current?.['state'];
  const current = context.over?.id ?? activeState;
  const index = columns.findIndex(([state]) => state === current);
  const next = Math.max(
    0,
    Math.min(
      columns.length - 1,
      index +
        (event.code === 'ArrowRight' || event.code === 'ArrowDown' ? 1 : -1),
    ),
  );
  const rect = context.droppableRects.get(columns[next]![0]);
  const activeRect = context.collisionRect;
  return rect && activeRect
    ? {
        x: rect.left + (rect.width - activeRect.width) / 2,
        y: rect.top + (rect.height - activeRect.height) / 2,
      }
    : undefined;
};
export function Board({
  load,
  save = saveAction,
  move = updateActionState,
  editAction = editBoardAction,
}: {
  load?: (query: BoardQuery) => Promise<BoardResponse>;
  save?: (input: CreateActionRequest) => Promise<BoardAction>;
  move?: (id: string, input: UpdateActionStateRequest) => Promise<BoardAction>;
  editAction?: (id: string, input: EditActionRequest) => Promise<BoardAction>;
}) {
  const {
    data,
    error,
    loading,
    membershipPending,
    refresh,
    accept,
    query,
    resultQuery,
    apply,
    track,
    current,
    includes,
    isFiltered,
  } = useBoard(load);
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [savedAction, setSavedAction] = useState<BoardAction>();
  const saveNotice = savedAction
    ? loading
      ? `${savedAction.title}: saved successfully. Checking current board selection…`
      : error
        ? `${savedAction.title}: saved successfully. Board refresh could not be confirmed; refresh the board. Do not repeat the save.`
        : includes(savedAction.id)
          ? `${savedAction.title}: saved successfully.`
          : isFiltered()
            ? `${savedAction.title}: saved successfully but the Action does not match current filters.`
            : `${savedAction.title}: saved successfully. The Action is no longer in the board results.`
    : undefined;
  const draft: BoardQuery = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(owner ? { owner, recursive } : {}),
  };
  const dirtyFilters = JSON.stringify(draft) !== JSON.stringify(query);
  const filtered = query.search !== undefined || query.owner !== undefined;
  const previousScope = JSON.stringify(query) !== JSON.stringify(resultQuery);
  const applyButton = useRef<HTMLButtonElement>(null);
  const focusedCard = useRef<string | undefined>(undefined);
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      focusedCard.current =
        event.target instanceof Element
          ? (event.target
              .closest('[data-action-id]')
              ?.getAttribute('data-action-id') ?? undefined)
          : undefined;
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);
  function saved(action: BoardAction) {
    accept(action);
    setSavedAction(action);
    void refresh();
  }
  const [editing, setEditing] = useState<BoardAction['state']>();
  const [detail, setDetail] = useState<BoardAction>();
  const suppressOpen = useRef(new Set<string>());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [pendingActions, setPendingActions] = useState<
    Map<string, { action: BoardAction; scope: string }>
  >(new Map());
  const moving = useRef(new Set<string>());
  const [moveErrors, setMoveErrors] = useState<Record<string, string>>({});
  const [moveNotice, setMoveNotice] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (
      focusedCard.current &&
      data &&
      !data.actions.some((action) => action.id === focusedCard.current) &&
      !document.querySelector(`[data-action-id="${focusedCard.current}"]`) &&
      document.activeElement === document.body
    ) {
      applyButton.current?.focus();
      setAnnouncement(
        'The focused Action no longer matches the displayed selection. Focus moved to Apply filters.',
      );
    }
  }, [data, pendingActions]);
  const [focusAfterMove, setFocusAfterMove] = useState<string>();
  useEffect(() => {
    if (!focusAfterMove) return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body)
        document
          .querySelector<HTMLElement>(`[data-action-id="${focusAfterMove}"]`)
          ?.focus();
      setFocusAfterMove(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, focusAfterMove]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );
  async function changeState(action: BoardAction, state: BoardAction['state']) {
    if (state === action.state || moving.current.has(action.id)) return;
    const hadFocus =
      document.activeElement
        ?.closest('[data-action-id]')
        ?.getAttribute('data-action-id') === action.id;
    moving.current.add(action.id);
    setPending(new Set(moving.current));
    setPendingActions((old) =>
      new Map(old).set(action.id, {
        action,
        scope: JSON.stringify(resultQuery),
      }),
    );
    setMoveErrors((old) => {
      const next = { ...old };
      delete next[action.id];
      return next;
    });
    setMoveNotice(undefined);
    try {
      const saved = await move(action.id, {
        state,
        expected: {
          state: action.state,
          updated_at: action.updated_at,
          ...(action.waiting_for === undefined
            ? {}
            : { waiting_for: action.waiting_for }),
        },
      });
      if (hadFocus) setFocusAfterMove(saved.id);
      accept(saved);
      if (isFiltered()) void refresh();
      setAnnouncement(
        `${action.title} moved to ${columns.find(([s]) => s === saved.state)?.[1]}.`,
      );
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'Unable to move Action.';
      setMoveErrors((old) => ({ ...old, [action.id]: message }));
      if (
        failure instanceof StateUpdateError &&
        failure.code === 'ACTION_CONFLICT'
      )
        setMoveNotice(
          `${action.title}: ${message} The board is refreshing to show the current Action.`,
        );
      setAnnouncement(`${action.title}: ${message}`);
      if (
        failure instanceof StateUpdateError &&
        failure.code === 'ACTION_CONFLICT'
      )
        void refresh();
    } finally {
      moving.current.delete(action.id);
      setPending(new Set(moving.current));
      setPendingActions((old) => {
        const next = new Map(old);
        next.delete(action.id);
        return next;
      });
    }
  }
  function onDragEnd(event: DragEndEvent) {
    setTimeout(() => suppressOpen.current.delete(String(event.active.id)), 300);
    const action = data?.actions.find((item) => item.id === event.active.id);
    const target = columns.find(([state]) => state === event.over?.id)?.[0];
    if (action && target && target === action.state)
      setAnnouncement(`${action.title} stayed in the same column.`);
    else if (action && target) void changeState(action, target);
    else setAnnouncement('Move cancelled.');
  }
  // A concurrent GET may finish while PATCH is pending; keep that card's
  // observed snapshot visible until the write confirms or fails.
  const visibleActions =
    data?.actions.map(
      (action) => pendingActions.get(action.id)?.action ?? action,
    ) ?? [];
  for (const { action, scope } of pendingActions.values()) {
    if (
      scope === JSON.stringify(resultQuery) &&
      !visibleActions.some((item) => item.id === action.id)
    )
      visibleActions.push(action);
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          owf <span>/ workspace</span>
        </span>
        <span className={styles.readOnly}>Local board</span>
      </header>
      <section className={styles.intro} aria-labelledby="title">
        <div>
          <p className={styles.eyebrow}>Workspace overview</p>
          <h1 id="title">Actions</h1>
          <p className={styles.subtitle}>Actions, organized by state.</p>
        </div>
        <button
          onClick={() => {
            void refresh();
          }}
        >
          {error ? 'Retry' : 'Refresh'} <span aria-hidden="true">↻</span>
        </button>
      </section>
      <form
        className={styles.filters}
        aria-label="Board filters"
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft);
        }}
      >
        <div>
          <label htmlFor="board-search">Search title or description</label>
          <input
            id="board-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <OwnerPicker
          allowAll
          value={owner}
          onChange={(value) => {
            setOwner(value);
            setRecursive(false);
          }}
        />
        <label className={styles.recursive}>
          <input
            type="checkbox"
            checked={recursive}
            disabled={!owner}
            onChange={(event) => setRecursive(event.target.checked)}
          />{' '}
          Include descendant Outcomes
        </label>
        <div className={`${styles.formButtons} ${styles.filterButtons}`}>
          <button ref={applyButton} type="submit">
            Apply filters
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setOwner('');
              setRecursive(false);
              apply({});
            }}
          >
            Clear filters
          </button>
        </div>
        <p role="status" className={styles.filterStatus}>
          {dirtyFilters ? 'Unapplied filter changes' : 'Filters applied'}
        </p>
      </form>
      <p className={styles.scope}>
        Applied scope: {describeScope(query)}.
        {previousScope && data
          ? ` Previous results: ${describeScope(resultQuery)} · ${data.actions.length} Actions.`
          : ''}
      </p>
      {membershipPending && data && (
        <p role="status" className={styles.scope}>
          Saved card snapshots are displayed; membership in the current filters
          has not been confirmed.
        </p>
      )}
      <div className={styles.context}>
        <p>
          <span>Workspace</span>{' '}
          {data?.workspace.root ?? 'Connecting to local Workspace…'}
        </p>
        <p role="status" aria-label="Board refresh">
          {error
            ? data
              ? 'Not current · refresh failed'
              : 'Unable to load'
            : loading
              ? data
                ? 'Refreshing…'
                : 'Loading Actions…'
              : pendingActions.size
                ? `${visibleActions.length} displayed Actions · move pending (previous card snapshots)`
                : `${data?.actions.length ?? 0} ${filtered ? 'matching Actions' : 'Actions'} · up to date`}
        </p>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          <strong>
            {data
              ? 'These Actions may be out of date.'
              : 'Actions could not be loaded.'}
          </strong>{' '}
          {error} Use Retry to read the Workspace again.
        </div>
      )}
      {moveNotice && (
        <div role="alert" className={styles.error}>
          {moveNotice}
        </div>
      )}
      {saveNotice && (
        <p role="status" className={styles.scope}>
          {saveNotice}
        </p>
      )}
      {data && visibleActions.length === 0 && !loading && !error && (
        <p className={styles.emptyBoard}>
          {filtered
            ? 'No Actions match these filters'
            : 'No Actions yet. Choose Add Action in a column to get started.'}
        </p>
      )}
      <p id="drag-instructions" className={styles.srOnly}>
        Press Enter to edit a card. Press Space to pick it up, use arrow keys to
        choose a column, then press Space to drop. Press Escape to cancel.
      </p>
      <div className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={columnCollision}
        onDragEnd={onDragEnd}
        onDragCancel={(event) => {
          setTimeout(
            () => suppressOpen.current.delete(String(event.active.id)),
            300,
          );
          setAnnouncement('Move cancelled.');
        }}
        onDragStart={(event) => {
          suppressOpen.current.add(String(event.active.id));
          const action = data?.actions.find(
            (item) => item.id === event.active.id,
          );
          if (action)
            setAnnouncement(
              `Moving ${action.title}. Choose a destination column.`,
            );
        }}
      >
        <div className={styles.board} aria-label="Action board">
          {columns.map(([state, title]) => {
            const actions = visibleActions.filter(
              (action) => action.state === state,
            );
            return (
              <BoardColumn key={state} state={state} title={title}>
                <h2 id={`column-${state}`}>
                  <span className={styles.dot} />
                  {title}
                  <span className={styles.count}>
                    {data ? actions.length : '—'}
                  </span>
                </h2>
                <button
                  id={`add-${state}`}
                  className={styles.add}
                  disabled={
                    !data || (editing !== undefined && editing !== state)
                  }
                  aria-expanded={editing === state}
                  onClick={() => {
                    if (editing === state)
                      document.getElementById('action-title')?.focus();
                    else setEditing(state);
                  }}
                >
                  + Add Action
                </button>
                {editing === state && (
                  <ActionForm
                    state={state}
                    label={title}
                    save={save}
                    onSaved={saved}
                    onClose={() => {
                      setEditing(undefined);
                      document.getElementById(`add-${state}`)?.focus();
                    }}
                  />
                )}
                <div className={styles.cards}>
                  {actions.map((action) => (
                    <MovableCard
                      key={action.id}
                      action={action}
                      pending={pending.has(action.id)}
                      error={moveErrors[action.id]}
                      onOpen={(selected) => {
                        if (!suppressOpen.current.has(selected.id) && !detail) {
                          track(selected);
                          setDetail(selected);
                        }
                      }}
                    />
                  ))}
                  {data && actions.length === 0 && (
                    <p className={styles.empty}>No Actions</p>
                  )}
                </div>
              </BoardColumn>
            );
          })}
        </div>
      </DndContext>
      {detail && (
        <ActionEditor
          action={detail}
          current={current}
          save={editAction}
          refresh={async () => {
            return refresh();
          }}
          onSaved={saved}
          onClose={() => {
            const id = detail.id;
            track(undefined);
            setDetail(undefined);
            requestAnimationFrame(() => {
              (
                document.querySelector<HTMLElement>(
                  `[data-action-id="${id}"]`,
                ) ??
                document.querySelector<HTMLElement>(`[data-action-id]`) ??
                document.querySelector<HTMLElement>(`.${styles.intro} button`)
              )?.focus();
            });
          }}
        />
      )}
      <footer className={styles.footer}>
        Drag cards between columns. CLI changes appear when you return to this
        tab or refresh.
      </footer>
    </main>
  );
}

function describeScope(query: BoardQuery) {
  return `${query.search === undefined ? 'All text' : `Search “${query.search}”`} · ${query.owner ?? 'All owners'}${query.owner ? (query.recursive ? ' including descendant Outcomes' : ' directly owned') : ''}`;
}
