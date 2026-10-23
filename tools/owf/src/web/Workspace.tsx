import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoredView } from '../contracts/index.js';
import { fetchViews } from './client.js';
import { Board } from './Board.js';
import { ViewBoard } from './ViewBoard.js';
import { ViewSelector, type BoardNavigation } from './ViewSelector.js';
import styles from './Board.module.css';

export function Workspace() {
  const [views, setViews] = useState<StoredView[]>([]);
  const [selected, setSelected] = useState<StoredView>();
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const refreshInventory = useCallback(() => {
    const request = ++generation.current;
    void fetchViews().then(
      (next) => {
        if (request !== generation.current) return;
        setViews(next);
        setError(undefined);
      },
      (failure: unknown) => {
        if (request !== generation.current) return;
        setError(
          failure instanceof Error ? failure.message : 'Unable to list Views.',
        );
      },
    );
  }, []);
  useEffect(
    () => () => {
      ++generation.current;
    },
    [],
  );
  const navigation: BoardNavigation = (guard, disabled) => (
    <ViewSelector
      views={views}
      selected={selected}
      disabled={disabled ?? false}
      onChange={(next) => {
        if (disabled || next?.id === selected?.id) return;
        const change = () => {
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
  );
  return (
    <>
      {error && (
        <div role="alert" className={styles.inventoryError}>
          View inventory could not be refreshed. {error}{' '}
          <button onClick={refreshInventory}>Retry Views</button>
        </div>
      )}
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
