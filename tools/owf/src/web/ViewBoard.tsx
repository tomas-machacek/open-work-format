import { useEffect, useRef, useState } from 'react';
import type { BoardAction, StoredView } from '../contracts/index.js';
import { ActionEditor, type EditorNavigation } from './ActionEditor.js';
import { CardContent } from './CardContent.js';
import { editBoardAction } from './client.js';
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
  const { data, loading, error, refresh } = useView(selected.id, onRefresh);
  const [detail, setDetail] = useState<BoardAction>();
  const [saved, setSaved] = useState<BoardAction>();
  const editorNavigation = useRef<EditorNavigation>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const focused = useRef<string | undefined>(undefined);
  const members = data?.columns.flatMap((column) => column.members) ?? [];
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
        {navigation(editorNavigation)}
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
      {data && (
        <div ref={board} className={styles.viewBoard} aria-label="View board">
          {data.columns.map((column) => (
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
                  <article
                    key={action.id}
                    className={`${styles.card} ${styles.passiveCard}`}
                    tabIndex={0}
                    aria-label={`${action.title}. Press Enter to edit`}
                    data-action-id={action.id}
                    onFocus={() => {
                      focused.current = action.id;
                    }}
                    onClick={() => setDetail(action)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDetail(action);
                      }
                    }}
                  >
                    <CardContent action={action} />
                    <p className={styles.executionState}>
                      State · {action.state.replace('_', ' ')}
                    </p>
                  </article>
                ))}
                {column.members.length === 0 && (
                  <p className={styles.empty}>No Actions</p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {detail && (
        <ActionEditor
          action={detail}
          current={members.find((action) => action.id === detail.id)}
          passive
          factsStale={!!error || loading}
          save={editBoardAction}
          refresh={() => refresh()}
          navigationRef={editorNavigation}
          navigation={navigation(editorNavigation)}
          onSaved={(action) => {
            setSaved(action);
            void refresh();
          }}
          onClose={() => {
            setDetail(undefined);
            requestAnimationFrame(() => {
              const card = [
                ...document.querySelectorAll<HTMLElement>('[data-action-id]'),
              ].find(
                (element) =>
                  element.getAttribute('data-action-id') === detail.id &&
                  element.closest('[aria-label="View board"]'),
              );
              (card ?? refreshButton.current)?.focus();
            });
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
