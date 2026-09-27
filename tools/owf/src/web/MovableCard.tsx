import { useDraggable } from '@dnd-kit/core';
import type { BoardAction } from '../contracts/index.js';
import styles from './Board.module.css';

export function MovableCard({
  action,
  columns,
  pending,
  error,
  onMove,
}: {
  action: BoardAction;
  columns: readonly (readonly [BoardAction['state'], string])[];
  pending: boolean;
  error?: string | undefined;
  onMove: (action: BoardAction, state: BoardAction['state']) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: action.id,
      disabled: pending,
      data: { state: action.state },
    });
  return (
    <article
      ref={setNodeRef}
      className={`${styles.card} ${isDragging ? styles.dragging : ''}`}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
    >
      <div className={styles.cardTop}>
        <h3>{action.title}</h3>
        <button
          type="button"
          className={styles.handle}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${action.title} to change state`}
          aria-describedby="drag-instructions"
          data-action-id={action.id}
          disabled={pending}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      </div>
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
      <label className={styles.moveLabel}>
        Move to
        <select
          aria-label={`Move ${action.title} to`}
          value={action.state}
          disabled={pending}
          onChange={(event) =>
            onMove(action, event.target.value as BoardAction['state'])
          }
        >
          {columns.map(([state, label]) => (
            <option key={state} value={state}>
              {label}
            </option>
          ))}
        </select>
      </label>
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
