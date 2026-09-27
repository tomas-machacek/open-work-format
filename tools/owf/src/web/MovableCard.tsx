import { useDraggable } from '@dnd-kit/core';
import type { BoardAction } from '../contracts/index.js';
import styles from './Board.module.css';

export function MovableCard({
  action,
  pending,
  error,
}: {
  action: BoardAction;
  pending: boolean;
  error?: string | undefined;
}) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: action.id,
    disabled: pending,
    data: { state: action.state },
  });
  return (
    <article
      ref={setNodeRef}
      className={`${styles.card} ${isDragging ? styles.dragging : ''} ${pending ? styles.pending : ''}`}
      {...listeners}
      tabIndex={0}
      aria-label={`Drag ${action.title} to change state`}
      aria-describedby="drag-instructions"
      aria-roledescription="draggable card"
      aria-disabled={pending}
      data-action-id={action.id}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
    >
      <h3>{action.title}</h3>
      <dl>
        <div>
          <dt>Owner:</dt>
          <dd>{action.owner.url}</dd>
        </div>
        {action.state === 'waiting' && action.waiting_for !== undefined && (
          <div className={styles.reason}>
            <dt>Waiting for:</dt>
            <dd>{action.waiting_for}</dd>
          </div>
        )}
      </dl>
      {pending && (
        <p className={styles.cardStatus} role="status">
          Moving…
        </p>
      )}
      {error && (
        <p className={styles.cardError} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
