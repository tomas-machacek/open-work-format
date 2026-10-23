import type { BoardAction } from '../contracts/index.js';
import styles from './Board.module.css';

export function CardContent({ action }: { action: BoardAction }) {
  return (
    <>
      <h3>{action.title}</h3>
      {action.blocking.blocked && (
        <p className={styles.blockBadge}>
          Blocked ·{' '}
          {[
            ...(action.blocking.manual ? ['manual'] : []),
            ...(action.blocking.unresolved_dependencies.length
              ? [
                  `${action.blocking.unresolved_dependencies.length} prerequisite${action.blocking.unresolved_dependencies.length === 1 ? '' : 's'}`,
                ]
              : []),
          ].join(' + ')}
        </p>
      )}
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
    </>
  );
}
