import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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
  closestCenter,
  type CollisionDetection,
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
  // A deferred text click belongs only to the latest gesture on this board.
  const gestureVersion = useRef(0);
  const keyboardActive = useRef(false);
  const collisionArgs = useRef<Parameters<CollisionDetection>[0] | undefined>(
    undefined,
  );
  const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    const mouse = (event: MouseEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    const touch = (event: TouchEvent) => {
      const point = event.changedTouches[0];
      if (point) pointer.current = { x: point.clientX, y: point.clientY };
    };
    document.addEventListener('mousemove', mouse, true);
    document.addEventListener('mouseup', mouse, true);
    document.addEventListener('touchmove', touch, true);
    document.addEventListener('touchend', touch, true);
    return () => {
      document.removeEventListener('mousemove', mouse, true);
      document.removeEventListener('mouseup', mouse, true);
      document.removeEventListener('touchmove', touch, true);
      document.removeEventListener('touchend', touch, true);
    };
  }, []);
  const cursor = useRef<{ column: string; position: number } | undefined>(
    undefined,
  );
  const targets = data.columns.map((column) => ({
    column,
    members: column.members.filter((a) => a.id !== active.current),
  }));
  const draggedAction = data.columns
    .flatMap((column) => column.members)
    .find((action) => action.id === active.current);
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
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboard,
      keyboardCodes: { start: ['Space'], end: ['Space'], cancel: ['Escape'] },
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        collisionArgs.current = args;
        if (args.pointerCoordinates) {
          const target = pointerTarget(args, args.pointerCoordinates);
          return target ? [{ id: target.id }] : [];
        }
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) => {
            if (!cursor.current) return true;
            const target = targets.find(
              (t) => t.column.id === cursor.current?.column,
            );
            const id =
              target && cursor.current.position === target.members.length + 2
                ? JSON.stringify([target.column.id, 'append'])
                : slotId(cursor.current.column, cursor.current.position);
            return container.id === id;
          }),
        });
      }}
      accessibility={{
        // ViewBoard restores focus after cancel/refresh or opens a reason dialog.
        // dnd-kit's restoration would steal focus back out of that dialog.
        restoreFocus: false,
        screenReaderInstructions: {
          draggable:
            'Enter opens detail. Space picks up and drops. Left/right choose column; up/down choose position. Home/End choose first/last; Down past last chooses append. Escape cancels. Drag from card background; text can be selected and copied.',
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
        collisionArgs.current = undefined;
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
      onDragEnd={() => {
        const action = active.current;
        active.current = undefined;
        // Release can arrive before the final collision render. Resolve the
        // actual release point against the same stable geometry as the indicator.
        const pointerDrop =
          collisionArgs.current && pointer.current
            ? pointerTarget(collisionArgs.current, pointer.current)
            : undefined;
        if (!action || (!pointerDrop && !keyboardActive.current)) {
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
            : pointerDrop?.data.current;
        onDrop({
          action,
          column: String(target?.['column']),
          ...(target?.['position'] === undefined
            ? {}
            : { position: Number(target['position']) }),
        });
      }}
    >
      <div
        className={styles.viewBoard}
        aria-label="View board"
        data-view-board=""
        onPointerDownCapture={() => {
          ++gestureVersion.current;
        }}
        onKeyDownCapture={() => {
          ++gestureVersion.current;
        }}
      >
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
            <ColumnContent
              column={column.id}
              title={column.title}
              empty={members.length === 0}
              disabled={disabled}
            >
              {column.members.map((action) => (
                <div className={styles.viewCardRow} key={action.id}>
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
                    gestureVersion={gestureVersion}
                  />
                </div>
              ))}
              <div className={styles.lastSlot}>
                <Slot
                  column={column.id}
                  title={column.title}
                  position={members.length + 1}
                  disabled={disabled}
                />
              </div>
            </ColumnContent>
          </section>
        ))}
      </div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {draggedAction && (
          <div className={styles.card} aria-hidden="true">
            <CardContent action={draggedAction} />
            <p className={styles.executionState}>
              State · {draggedAction.state.replace('_', ' ')}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
function slotId(column: string, position: number) {
  return JSON.stringify([column, position]);
}
function pointerTarget(
  args: Parameters<CollisionDetection>[0],
  { x, y }: { x: number; y: number },
) {
  // The line never participates in layout. Use current viewport rectangles so
  // scrolling and an immediate release see the same generous activation areas.
  const board = document.elementFromPoint(x, y)?.closest('[data-view-board]');
  if (!board) return;
  const column = args.droppableContainers.find((container) => {
    if (container.data.current?.['append'] !== true) return false;
    if (!container.node.current || !board.contains(container.node.current))
      return false;
    const rect = container.node.current?.getBoundingClientRect();
    return (
      rect &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top - 2 &&
      y <= rect.bottom
    );
  });
  if (!column) return;
  const slots = args.droppableContainers
    .filter(
      (container) =>
        container.data.current?.['column'] ===
          column.data.current?.['column'] &&
        container.data.current?.['append'] !== true,
    )
    .sort(
      (a, b) =>
        Number(a.data.current?.['position']) -
        Number(b.data.current?.['position']),
    );
  const last = slots.at(-1);
  const lastRect = last?.node.current?.getBoundingClientRect();
  if (
    column.data.current?.['empty'] !== true &&
    lastRect &&
    y > lastRect.top + 24
  )
    return column;
  return slots.reduce((best, slot) => {
    const rect = slot.node.current?.getBoundingClientRect();
    const bestRect = best?.node.current?.getBoundingClientRect();
    return rect &&
      (!bestRect || Math.abs(rect.top - y) < Math.abs(bestRect.top - y))
      ? slot
      : best;
  }, slots[0]);
}
function ColumnContent({
  column,
  title,
  empty,
  disabled,
  children,
}: {
  column: string;
  title: string;
  empty: boolean;
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: JSON.stringify([column, 'append']),
    disabled,
    data: { column, title, append: true, empty },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.viewCards} ${empty ? styles.emptyColumn : ''} ${isOver ? styles.appendOver : ''}`}
      aria-label={`${title}: append`}
    >
      {children}
    </div>
  );
}
function Slot({
  column,
  title,
  position,
  disabled,
}: {
  column: string;
  title: string;
  position: number;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: slotId(column, position),
    disabled,
    data: { column, title, position },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.insertionSlot} ${isOver ? styles.activeSlot : ''}`}
      aria-label={`${title}: position ${position}`}
    />
  );
}
function ViewCard({
  action,
  disabled,
  onOpen,
  gestureVersion,
}: {
  action: BoardAction;
  disabled: boolean;
  onOpen: (action: BoardAction) => void;
  gestureVersion: RefObject<number>;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useDraggable({
      id: action.id,
      disabled,
      attributes: { role: 'article', roleDescription: 'draggable card' },
    });
  const gesture = useRef({ x: 0, y: 0, suppressClick: false, dragged: false });
  const textTouchStart = useRef<number | undefined>(undefined);
  const textClick = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(textClick.current), []);
  useEffect(() => {
    if (disabled) clearTimeout(textClick.current);
  }, [disabled]);
  useEffect(() => {
    if (isDragging) {
      gesture.current.dragged = true;
      clearTimeout(textClick.current);
    }
  }, [isDragging]);
  return (
    <article
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      {...attributes}
      className={`${styles.card} ${styles.viewCard} ${isDragging ? styles.viewDragging : ''}`}
      data-action-id={action.id}
      data-dragging={isDragging}
      tabIndex={0}
      aria-label={`${action.title}. Press Enter to edit or Space to move`}
      onPointerDown={(event) => {
        clearTimeout(textClick.current);
        gesture.current = {
          x: event.clientX,
          y: event.clientY,
          suppressClick: false,
          dragged: false,
        };
      }}
      onPointerMove={(event) => {
        if (
          Math.hypot(
            event.clientX - gesture.current.x,
            event.clientY - gesture.current.y,
          ) >= 6
        )
          gesture.current.suppressClick = true;
      }}
      onMouseDown={(event) => {
        if (
          !isTextOrControl(
            event.currentTarget,
            event.target,
            event.clientX,
            event.clientY,
          )
        )
          listeners?.onMouseDown?.(event);
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        const textOrControl =
          touch &&
          isTextOrControl(
            event.currentTarget,
            event.target,
            touch.clientX,
            touch.clientY,
          );
        textTouchStart.current = textOrControl ? event.timeStamp : undefined;
        if (touch && !textOrControl) listeners?.onTouchStart?.(event);
      }}
      onTouchEnd={(event) => {
        // Some touch browsers synthesize a click after a text long press even
        // when native selection/context-menu UI has consumed the gesture.
        if (
          textTouchStart.current !== undefined &&
          event.timeStamp - textTouchStart.current >= 200
        )
          gesture.current.suppressClick = true;
        textTouchStart.current = undefined;
      }}
      onTouchCancel={() => {
        gesture.current.suppressClick = true;
      }}
      onContextMenu={() => {
        gesture.current.suppressClick = true;
        clearTimeout(textClick.current);
      }}
      onClick={(event) => {
        if (
          isDragging ||
          gesture.current.dragged ||
          gesture.current.suppressClick ||
          window.getSelection()?.isCollapsed === false ||
          isControl(event.target, event.currentTarget)
        )
          return;
        if (
          event.detail > 0 &&
          isTextOrControl(
            event.currentTarget,
            event.target,
            event.clientX,
            event.clientY,
          )
        ) {
          // Allow the second press of native double-click selection before opening.
          const version = gestureVersion.current;
          textClick.current = setTimeout(() => {
            if (
              version === gestureVersion.current &&
              window.getSelection()?.isCollapsed !== false
            )
              onOpen(action);
          }, 400);
        } else onOpen(action);
      }}
      onDoubleClick={() => clearTimeout(textClick.current)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        clearTimeout(textClick.current);
        if (event.code === 'Space' && !disabled) listeners?.onKeyDown?.(event);
        if (event.key === 'Enter' && !isDragging) {
          event.preventDefault();
          onOpen(action);
        }
      }}
    >
      <CardContent action={action} />
      <p className={styles.executionState}>
        State · {action.state.replace('_', ' ')}
      </p>
    </article>
  );
}

function isControl(target: EventTarget, card: HTMLElement) {
  return (
    target instanceof Element &&
    target !== card &&
    !!target.closest(
      'a, button, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"]',
    )
  );
}

function isTextOrControl(
  card: HTMLElement,
  target: EventTarget,
  x: number,
  y: number,
) {
  if (isControl(target, card)) return true;
  // Element hit testing also includes empty space around text. Text ranges let
  // that padding remain draggable without preventing native selection/copy.
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue;
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      )
        return true;
    }
  }
  return false;
}
