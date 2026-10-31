import { Notifications, useFeedback } from './Notifications.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredView } from '../contracts/index.js';
import { fetchViews } from './client.js';
import { Board } from './Board.js';
import { ViewBoard } from './ViewBoard.js';
import { ViewSelector, type BoardNavigation } from './ViewSelector.js';
import styles from './Board.module.css';

function WorkspaceContent() {
  const feedback = useFeedback();
  const [views, setViews] = useState<StoredView[]>([]);
  const [selected, setSelected] = useState<StoredView>();
  const [error, setError] = useState<string>();
  const lastFailure = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const refreshInventory = useCallback(
    (automatic = false) => {
      if (!automatic) lastFailure.current = undefined;
      const request = ++generation.current;
      void fetchViews().then(
        (next) => {
          if (request !== generation.current) return;
          setViews(next);
          setError(undefined);
          lastFailure.current = undefined;
        },
        (failure: unknown) => {
          if (request !== generation.current) return;
          const message =
            failure instanceof Error
              ? failure.message
              : 'Unable to list Views.';
          setError(message);
          if (message !== lastFailure.current)
            feedback.report(
              `View inventory could not be refreshed. ${message} Use Retry Views.`,
            );
          lastFailure.current = message;
        },
      );
    },
    [feedback],
  );
  useEffect(
    () => () => {
      ++generation.current;
    },
    [],
  );
  const navigation: BoardNavigation = (guard, disabled) => (
    <div className={styles.navigation}>
      <ViewSelector
        views={views}
        selected={selected}
        disabled={disabled ?? false}
        onChange={(next) => {
          if (disabled || next?.id === selected?.id) return;
          const change = () => {
            feedback.clear();
            ++generation.current;
            setSelected(next);
            requestAnimationFrame(() =>
              [
                ...document.querySelectorAll<HTMLSelectElement>(
                  'header select[aria-label="Display"]',
                ),
              ]
                .find((element) => !element.closest('[hidden]'))
                ?.focus(),
            );
          };
          if (guard.current) guard.current.requestClose(change);
          else change();
        }}
      />
      <div role="status" className={styles.inventoryStatus}>
        <span>{error ? 'Views not current' : 'Views available'}</span>
        <button
          type="button"
          style={{ visibility: error ? 'visible' : 'hidden' }}
          disabled={disabled}
          onClick={() => {
            feedback.clear();
            lastFailure.current = undefined;
            refreshInventory();
          }}
        >
          Retry Views
        </button>
      </div>
    </div>
  );
  return (
    <>
      <div hidden={selected !== undefined}>
        <Board
          active={!selected}
          navigation={navigation}
          onRefresh={refreshInventory}
        />
      </div>
      {selected && (
        <ViewBoard
          key={selected.id}
          selected={selected}
          navigation={navigation}
          onRefresh={refreshInventory}
        />
      )}
    </>
  );
}

export function Workspace() {
  return (
    <Notifications>
      <WorkspaceContent />
    </Notifications>
  );
}
