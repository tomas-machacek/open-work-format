import { Fragment, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  useDraggable,
  useDroppable,
  pointerWithin,
  closestCenter,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type {
  BoardAction,
  ViewResponse,
  ViewMoveRequest,
} from '../contracts/index.js';
import { CardContent } from './CardContent.js';
import styles from './Board.module.css';
export function ViewDragBoard({
  data,
  disabled,
  onOpen,
  onStart,
  onCancel,
  onDrop,
}: {
  data: ViewResponse;
  disabled: boolean;
  onOpen: (action: BoardAction) => void;
  onStart: (id: string) => void;
  onCancel: () => void;
  onDrop: (input: ViewMoveRequest) => void;
}) {
  const active = useRef<string | undefined>(undefined);
  const keyboardActive = useRef(false);
  const cursor = useRef<{ column: string; position: number } | undefined>(
    undefined,
  );
  const targets = data.columns.map((column) => ({
    column,
    members: column.members.filter((a) => a.id !== active.current),
  }));
  const keyboard: KeyboardCoordinateGetter = (event, { context }) => {
    if (
      ![
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ].includes(event.code)
    )
      return;
    event.preventDefault();
    const targets = data.columns.map((column) => ({
      column,
      members: column.members.filter((a) => a.id !== active.current),
    }));
    const current = cursor.current;
    const source = data.columns.find((c) =>
      c.members.some((a) => a.id === active.current),
    );
    let col = targets.findIndex(
      (c) => c.column.id === (current?.column ?? source?.id),
    );
    let pos = Number(
      current?.position ??
        (source?.members.findIndex((a) => a.id === active.current) ?? 0) + 1,
    );
    if (event.code === 'ArrowLeft') col = Math.max(0, col - 1);
    if (event.code === 'ArrowRight')
      col = Math.min(targets.length - 1, col + 1);
    const target = targets[col];
    if (!target) return;
    if (event.code === 'ArrowUp') pos--;
    if (event.code === 'ArrowDown') pos++;
    if (event.code === 'Home') pos = 1;
    if (event.code === 'End') pos = target.members.length + 1;
    pos = Math.max(1, Math.min(target.members.length + 2, pos));
    cursor.current = { column: target.column.id, position: pos };
    const targetId =
      pos === target.members.length + 2
        ? JSON.stringify([target.column.id, 'append'])
        : slotId(target.column.id, pos);
    const node = context.droppableContainers.get(targetId)?.node.current;
    // KeyboardSensor scrolls for arrows, but Home/End jumps need an explicit
    // scroll. Read the destination's viewport geometry after that scroll.
    const jumps = event.code === 'Home' || event.code === 'End';
    if (jumps)
      node?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant',
      });
    const rect =
      jumps && node
        ? node.getBoundingClientRect()
        : context.droppableRects.get(targetId);
    const collision = context.collisionRect;
    return rect && collision
      ? {
          x: rect.left + rect.width / 2 - collision.width / 2,
          y: rect.top + rect.height / 2 - collision.height / 2,
        }
      : undefined;
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboard }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) =>
        args.pointerCoordinates
          ? pointerWithin(args)
          : closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) => {
                  if (!cursor.current) return true;
                  const target = targets.find(
                    (t) => t.column.id === cursor.current?.column,
                  );
                  const id =
                    target &&
                    cursor.current.position === target.members.length + 2
                      ? JSON.stringify([target.column.id, 'append'])
                      : slotId(cursor.current.column, cursor.current.position);
                  return container.id === id;
                },
              ),
            })
      }
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Space picks up and drops. Left/right choose column; up/down choose position. Home/End choose first/last. Escape cancels.',
        },
        announcements: {
          onDragStart: () => 'Card picked up.',
          onDragOver: ({ over }) =>
            over
              ? `${String(over.data.current?.['title'])}, ${over.data.current?.position ? `position ${String(over.data.current['position'])}` : 'append'}`
              : 'Outside a drop target.',
          onDragEnd: () => 'Drag ended.',
          onDragCancel: () => 'Drag cancelled.',
        },
      }}
      onDragStart={({ active: card, activatorEvent }) => {
        keyboardActive.current = activatorEvent.type === 'keydown';
        active.current = String(card.id);
        const source = data.columns.find((c) =>
          c.members.some((a) => a.id === active.current),
        );
        cursor.current = source
          ? {
              column: source.id,
              position:
                source.members.findIndex((a) => a.id === active.current) + 1,
            }
          : undefined;
        onStart(String(card.id));
      }}
      onDragCancel={() => {
        active.current = undefined;
        onCancel();
      }}
      onDragEnd={({ over }) => {
        const action = active.current;
        active.current = undefined;
        if (!action || (!over && !keyboardActive.current)) {
          onCancel();
          return;
        }
        // Keyboard drops use the chosen slot even when Space follows an arrow
        // before dnd-kit's next collision-measurement frame.
        const chosen = cursor.current;
        const column = data.columns.find((c) => c.id === chosen?.column);
        const maximum =
          (column?.members.filter((a) => a.id !== action).length ?? 0) + 1;
        const target =
          keyboardActive.current && chosen
            ? {
                column: chosen.column,
                position:
                  chosen.position > maximum ? undefined : chosen.position,
              }
            : over?.data.current;
        onDrop({
          action,
          column: String(target?.['column']),
          ...(target?.['position'] === undefined
            ? {}
            : { position: Number(target['position']) }),
        });
      }}
    >
      <div className={styles.viewBoard} aria-label="View board">
        {targets.map(({ column, members }) => (
          <section
            key={column.id}
            className={styles.column}
            aria-label={column.title}
          >
            <h2>
              {column.title}
              <span className={styles.count}>{column.members.length}</span>
            </h2>
            <div className={styles.cards}>
              {column.members.map((action) => (
                <Fragment key={action.id}>
                  {action.id !== active.current && (
                    <Slot
                      column={column.id}
                      title={column.title}
                      position={
                        members.findIndex((a) => a.id === action.id) + 1
                      }
                      disabled={disabled}
                    />
                  )}
                  <ViewCard
                    action={action}
                    disabled={disabled}
                    onOpen={onOpen}
                  />
                </Fragment>
              ))}
              <Slot
                column={column.id}
                title={column.title}
                position={members.length + 1}
                disabled={disabled}
              />
              <Slot
                column={column.id}
                title={column.title}
                disabled={disabled}
              />
            </div>
          </section>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active.current && (
          <div className={styles.card}>
            <CardContent
              action={data.columns
                .flatMap((c) => c.members)
                .find((a) => a.id === active.current)!}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
function slotId(column: string, position: number) {
  return JSON.stringify([column, position]);
}
function Slot({
  column,
  title,
  position,
  disabled,
}: {
  column: string;
  title: string;
  position?: number;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id:
      position === undefined
        ? JSON.stringify([column, 'append'])
        : slotId(column, position),
    disabled,
    data: { column, title, position },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.insertionSlot} ${position === undefined ? styles.appendTarget : ''} ${isOver ? styles.activeSlot : ''}`}
      aria-label={`${title}: ${position === undefined ? 'append' : `position ${position}`}`}
    >
      {position === undefined ? 'Append to column' : `Insert at ${position}`}
    </div>
  );
}
function ViewCard({
  action,
  disabled,
  onOpen,
}: {
  action: BoardAction;
  disabled: boolean;
  onOpen: (action: BoardAction) => void;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useDraggable({ id: action.id, disabled });
  return (
    <article
      ref={setNodeRef}
      className={`${styles.card} ${isDragging ? styles.dragging : ''}`}
      data-action-id={action.id}
      tabIndex={0}
      aria-label={`${action.title}. Press Enter to edit`}
      onClick={() => {
        if (!isDragging) onOpen(action);
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === 'Enter' || event.key === ' ') &&
          !isDragging
        ) {
          event.preventDefault();
          onOpen(action);
        }
      }}
    >
      <button
        type="button"
        onClick={(event) => event.stopPropagation()}
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        disabled={disabled}
        className={styles.dragHandle}
        aria-label={`Drag ${action.title}`}
      >
        Move card
      </button>
      <div>
        <CardContent action={action} />
        <p className={styles.executionState}>
          State · {action.state.replace('_', ' ')}
        </p>
      </div>
    </article>
  );
}
