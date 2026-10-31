import { CardContent } from './CardContent.js';
import { useDraggable } from '@dnd-kit/core';
import type { BoardAction } from '../contracts/index.js';
import styles from './Board.module.css';

export function MovableCard({
  action,
  pending,
  movementDisabled = false,
  onOpen,
}: {
  action: BoardAction;
  pending: boolean;
  movementDisabled?: boolean;
  onOpen: (action: BoardAction) => void;
}) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: action.id,
    disabled: pending || movementDisabled,
    data: { state: action.state },
  });
  return (
    <article
      ref={setNodeRef}
      className={`${styles.card} ${isDragging ? styles.dragging : ''} ${pending ? styles.pending : ''}`}
      {...listeners}
      tabIndex={0}
      aria-label={`${action.title}. Press Enter to edit or Space to move`}
      aria-describedby="drag-instructions"
      aria-roledescription="draggable card"
      aria-disabled={pending}
      data-action-id={action.id}
      onClick={() => {
        if (!pending && !isDragging) onOpen(action);
      }}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        if (event.key === 'Enter' && !pending && !isDragging) {
          event.preventDefault();
          onOpen(action);
        }
      }}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
    >
      <CardContent action={action} />
      {pending && (
        <p className={styles.cardStatus} role="status">
          Moving…
        </p>
      )}
    </article>
  );
}
