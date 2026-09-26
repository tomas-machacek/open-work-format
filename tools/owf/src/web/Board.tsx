import type { BoardAction, BoardResponse } from '../contracts/index.js';
import { useBoard } from './useBoard.js';
import styles from './Board.module.css';

const columns: [BoardAction['state'], string][] = [
  ['open', 'Open'],
  ['in_progress', 'In Progress'],
  ['waiting', 'Waiting'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];
export function Board({ load }: { load?: () => Promise<BoardResponse> }) {
  const { data, error, loading, refresh } = useBoard(load);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          owf <span>/ workspace</span>
        </span>
        <span className={styles.readOnly}>Read-only board</span>
      </header>
      <section className={styles.intro} aria-labelledby="title">
        <div>
          <p className={styles.eyebrow}>Workspace overview</p>
          <h1 id="title">Actions</h1>
          <p className={styles.subtitle}>All Actions, organized by state.</p>
        </div>
        <button
          onClick={() => {
            void refresh();
          }}
        >
          {error ? 'Retry' : 'Refresh'} <span aria-hidden="true">↻</span>
        </button>
      </section>
      <div className={styles.context}>
        <p>
          <span>Workspace</span>{' '}
          {data?.workspace.root ?? 'Connecting to local Workspace…'}
        </p>
        <p role="status">
          {error
            ? data
              ? 'Not current · refresh failed'
              : 'Unable to load'
            : loading
              ? data
                ? 'Refreshing…'
                : 'Loading Actions…'
              : `${data?.actions.length ?? 0} Actions · up to date`}
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
      {data?.actions.length === 0 && (
        <p className={styles.emptyBoard}>
          No Actions yet. Create your first Action with the CLI, then refresh.
        </p>
      )}
      <div className={styles.board} aria-label="Action board">
        {columns.map(([state, title]) => {
          const actions =
            data?.actions.filter((action) => action.state === state) ?? [];
          return (
            <section
              key={state}
              aria-label={title}
              className={styles.column}
              data-state={state}
            >
              <h2 id={`column-${state}`}>
                <span className={styles.dot} />
                {title}
                <span className={styles.count}>
                  {data ? actions.length : '—'}
                </span>
              </h2>
              <div className={styles.cards}>
                {actions.map((action) => (
                  <article key={action.id} className={styles.card}>
                    <h3>{action.title}</h3>
                    {action.state === 'waiting' &&
                      action.waiting_for !== undefined && (
                        <p className={styles.reason}>
                          <span>Waiting for</span>
                          {action.waiting_for}
                        </p>
                      )}
                    <dl>
                      <div>
                        <dt>Owner</dt>
                        <dd>{action.owner.url}</dd>
                      </div>
                      <div>
                        <dt>ID</dt>
                        <dd className={styles.id}>{action.id}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
                {data && actions.length === 0 && (
                  <p className={styles.empty}>No Actions</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <footer className={styles.footer}>
        Changes made in the CLI appear when you return to this tab or refresh.
      </footer>
    </main>
  );
}
