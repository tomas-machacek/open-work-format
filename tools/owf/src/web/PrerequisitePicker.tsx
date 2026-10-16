import { useEffect, useRef, useState } from 'react';
import type { BoardAction } from '../contracts/index.js';
import { fetchBoard } from './client.js';
import styles from './Board.module.css';

export function PrerequisitePicker({
  value,
  original,
  current,
  sourceFactsStale,
  disabled,
  onChange,
}: {
  value: string[];
  original: string[];
  current: BoardAction | undefined;
  sourceFactsStale: boolean;
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [candidates, setCandidates] = useState<BoardAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [facts, setFacts] = useState<BoardAction[]>([]);
  const [factsStale, setFactsStale] = useState(true);
  const searchInput = useRef<HTMLInputElement>(null);
  const options = useRef<HTMLUListElement>(null);
  const rows = useRef<HTMLUListElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void fetchBoard(search.trim() ? { search: search.trim() } : {}).then(
      (result) => {
        if (!active) return;
        setCandidates(result.actions);
        setLoading(false);
      },
      (failure: unknown) => {
        if (!active) return;
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to find Actions.',
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [search, attempt]);
  // Unsaved selections are not part of the source projection. Refresh their
  // observed facts independently of board filters and picker search responses.
  useEffect(() => {
    let active = true;
    setFactsStale(true);
    void fetchBoard().then(
      (result) => {
        if (!active) return;
        setFacts(result.actions);
        setFactsStale(false);
      },
      () => {
        if (active) setFactsStale(true);
      },
    );
    return () => {
      active = false;
    };
  }, [current, attempt]);
  const removed = original.filter((uri) => !value.includes(uri));
  function remove(uri: string, index: number) {
    onChange(value.filter((item) => item !== uri));
    requestAnimationFrame(() => {
      const controls =
        rows.current?.querySelectorAll<HTMLButtonElement>('button');
      (
        controls?.[Math.min(index, controls.length - 1)] ?? searchInput.current
      )?.focus();
    });
  }
  return (
    <section
      className={styles.blockingSection}
      aria-labelledby="prerequisite-heading"
    >
      <h3 id="prerequisite-heading">Prerequisites to save</h3>
      <p className={styles.hint}>
        Draft membership. Target facts are current observations and can change
        before saving.
      </p>
      {value.length === 0 && <p>No prerequisites selected.</p>}
      <ul ref={rows} className={styles.dependencyRows}>
        {[...value].sort().map((uri, index) => {
          const saved = current?.blocking.dependencies.find(
            (item) => item.uri === uri,
          );
          const observed = facts.find(
            (item) => `owf:action:${item.id}` === uri,
          );
          const pending = !original.includes(uri);
          return (
            <li key={uri}>
              <strong>
                {saved?.title ?? observed?.title ?? 'Action unavailable'}
              </strong>
              <small>{uri}</small>
              <span>
                {pending ? 'Pending addition' : 'Selected'} ·{' '}
                {saved
                  ? `${saved.state} · ${sourceFactsStale ? 'Facts stale' : saved.satisfied ? 'Satisfied' : 'Unresolved'}`
                  : observed
                    ? `${observed.state} · ${factsStale || sourceFactsStale ? 'Facts stale' : observed.state === 'completed' ? 'Satisfied' : 'Unresolved'}`
                    : 'Facts unavailable'}
              </span>
              {pending && (factsStale || sourceFactsStale) && (
                <small>Facts stale/unavailable. Retry lookup to refresh.</small>
              )}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove prerequisite ${uri}`}
                onClick={() => remove(uri, index)}
              >
                Remove
              </button>
            </li>
          );
        })}
        {removed.sort().map((uri) => (
          <li key={uri}>
            <small>{uri}</small>
            <span>Pending removal</span>
          </li>
        ))}
      </ul>
      <label htmlFor="prerequisite-search">Add prerequisite</label>
      <p id="prerequisite-scope" className={styles.hint}>
        Search title or description across the entire Workspace, including all
        Projects and states.
      </p>
      <input
        id="prerequisite-search"
        ref={searchInput}
        value={search}
        disabled={disabled}
        aria-describedby="prerequisite-scope"
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            options.current
              ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
              ?.focus();
          }
        }}
      />
      {loading && <p role="status">Finding Actions…</p>}
      {error && <p role="alert">Lookup failed: {error}</p>}
      <button
        className={styles.ownerRefresh}
        type="button"
        disabled={disabled || loading}
        onClick={() => setAttempt((value) => value + 1)}
      >
        {error || factsStale
          ? 'Retry prerequisite lookup'
          : 'Refresh prerequisite lookup'}
      </button>
      {!loading && !error && (
        <>
          {candidates.length === 0 && (
            <p role="status">No Actions match this search.</p>
          )}
          <ul
            ref={options}
            className={styles.ownerOptions}
            aria-label="Prerequisite candidates"
          >
            {candidates.map((candidate) => {
              const uri = `owf:action:${candidate.id}`;
              const selected = value.includes(uri);
              return (
                <li key={uri}>
                  <button
                    type="button"
                    disabled={disabled || selected}
                    onClick={() => {
                      onChange([...value, uri]);
                      searchInput.current?.focus();
                    }}
                  >
                    <strong>{candidate.title}</strong>{' '}
                    <span>{candidate.state}</span>
                    <small>{candidate.owner.url}</small>
                    <small>
                      {uri}
                      {selected ? ' · Already selected' : ''}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
