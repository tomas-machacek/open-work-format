import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BoardAction } from '../contracts/index.js';
import { fetchBoard } from './client.js';
import { ActionIdentity } from './ActionIdentity.js';
import styles from './Board.module.css';

type TargetFact = BoardAction['blocking']['dependencies'][number];
type Observations = Map<
  string,
  {
    target: TargetFact | undefined;
    request: number;
    owner?: { url: string; request: number };
  }
>;

function rememberFacts(
  previous: Observations,
  actions: BoardAction[],
  request: number,
  complete = false,
): Observations {
  const next = new Map(previous);
  // Filtered absence is never evidence of a missing target. Request order also
  // protects owner observations from older Workspace lookups.
  if (complete)
    for (const [uri, fact] of next)
      if (fact.request <= request)
        next.set(uri, { ...fact, target: undefined, request });
  for (const action of actions) {
    const uri = `owf:action:${action.id}`;
    if ((next.get(uri)?.request ?? -1) > request) continue;
    next.set(uri, {
      request,
      owner: { url: action.owner.url, request },
      target: {
        uri,
        title: action.title,
        state: action.state,
        satisfied: action.state === 'completed',
      },
    });
  }
  return next;
}

export function PrerequisitePicker({
  value,
  original,
  current,
  saved,
  sourceFactsStale,
  disabled,
  dirty,
  refreshSource,
  onChange,
  children,
}: {
  value: string[];
  original: string[];
  current: BoardAction | undefined;
  saved: BoardAction;
  sourceFactsStale: boolean;
  disabled: boolean;
  dirty: boolean;
  refreshSource: () => Promise<boolean>;
  onChange: (value: string[]) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [facts, setFacts] = useState<Observations>(() => new Map());
  const [sourceRequest, setSourceRequest] = useState(0);
  const [targetRefresh, setTargetRefresh] = useState({
    request: 0,
    stale: true,
    loading: true,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [sourceFailed, setSourceFailed] = useState(false);
  const requests = useRef(0);
  const alive = useRef(true);
  const refreshLock = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const options = useRef<HTMLUListElement>(null);
  const rows = useRef<HTMLUListElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const lookupTargets = useCallback(async () => {
    const request = ++requests.current;
    setTargetRefresh({ request, stale: true, loading: true });
    try {
      const result = await fetchBoard();
      if (!alive.current) return;
      setFacts((previous) =>
        rememberFacts(previous, result.actions, request, true),
      );
      setTargetRefresh((previous) =>
        previous.request === request
          ? { request, stale: false, loading: false }
          : previous,
      );
    } catch {
      if (alive.current)
        setTargetRefresh((previous) =>
          previous.request === request
            ? { request, stale: true, loading: false }
            : previous,
        );
    }
  }, []);
  // Source projections omit owner. They can refresh target facts, but never
  // advance the owner observation's own timestamp or erase a known path.
  useEffect(() => {
    setSourceRequest(++requests.current);
    void lookupTargets();
  }, [current, lookupTargets]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const request = ++requests.current;
    setLoading(true);
    setError(undefined);
    void fetchBoard(search.trim() ? { search: search.trim() } : {}).then(
      (result) => {
        if (!active) return;
        setCandidates(
          result.actions.map((action) => `owf:action:${action.id}`),
        );
        setFacts((previous) =>
          rememberFacts(previous, result.actions, request),
        );
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
  }, [open, search, attempt]);
  function closePicker(focus = false) {
    setOpen(false);
    setSearch('');
    if (focus) addButton.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !picker.current?.contains(event.target) &&
        !(
          event.target instanceof Element &&
          event.target.closest('[data-blocking-refresh]')
        )
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('pointerdown', outside);
    // Identity handles Escape in capture phase first. The picker must also
    // handle it when focus is on Refresh or was lost by a disabled control.
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setSearch('');
      addButton.current?.focus();
    };
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', dismiss);
    };
  }, [open]);
  useLayoutEffect(() => {
    // Loading results grow the picker after input focus has already scrolled
    // the dialog. Keep the complete bounded dropdown inside its viewport.
    if (open) dropdown.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, loading, error]);
  async function refreshAll() {
    if (refreshLock.current) return;
    refreshLock.current = true;
    if (open) searchInput.current?.focus();
    setRefreshing(true);
    await Promise.all([
      refreshSource().then(
        (success) => {
          if (alive.current) setSourceFailed(!success);
        },
        () => {
          if (alive.current) setSourceFailed(true);
        },
      ),
      lookupTargets(),
    ]);
    refreshLock.current = false;
    if (alive.current) setRefreshing(false);
  }
  function remove(uri: string, index: number) {
    onChange(value.filter((item) => item !== uri));
    requestAnimationFrame(() => {
      const controls = rows.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-membership]',
      );
      (
        controls?.[Math.min(index, controls.length - 1)] ?? addButton.current
      )?.focus();
    });
  }
  function choose(uri: string) {
    if (!value.includes(uri)) onChange([...value, uri]);
    closePicker(true);
  }
  function observeTarget(uri: string) {
    const sourceFact = saved.blocking.dependencies.find(
      (item) => item.uri === uri,
    );
    const observed = facts.get(uri);
    const useObserved =
      observed && (!sourceFact || observed.request >= sourceRequest);
    const target = useObserved ? observed.target : sourceFact;
    const stale = useObserved
      ? targetRefresh.stale && observed.request < targetRefresh.request
      : sourceFactsStale || sourceFailed;
    const owner = observed?.owner;
    const ownerStale =
      owner &&
      (owner.request < sourceRequest ||
        (targetRefresh.stale && owner.request < targetRefresh.request) ||
        !observed.target);
    return {
      target,
      stale,
      owner: owner?.url,
      ownerStatus: ownerStale
        ? 'Owner stale'
        : !owner
          ? targetRefresh.loading
            ? 'Owner loading…'
            : 'Owner unavailable'
          : undefined,
    };
  }
  const blocking = saved.blocking;
  const count = blocking.unresolved_dependencies.length;
  const summary = blocking.blocked
    ? `Blocked · ${[blocking.manual ? 'manual' : '', count ? `${count} prerequisite${count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' + ')}`
    : 'Not blocked';
  return (
    <section
      className={styles.blockingSection}
      aria-labelledby="blocking-heading"
    >
      <div className={styles.blockingHeader}>
        <h3 id="blocking-heading">Blocking</h3>
        <span>{summary}</span>
        {dirty && <span className={styles.pendingChange}>Unsaved changes</span>}
        <button
          data-blocking-refresh
          className={styles.compactButton}
          type="button"
          aria-label="Refresh blocking"
          disabled={disabled || refreshing || targetRefresh.loading}
          onClick={() => {
            void refreshAll();
          }}
        >
          {refreshing || targetRefresh.loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {(sourceFactsStale || sourceFailed) && (
        <p role="status">
          Saved facts stale/unavailable. Refresh to check current blocking.
        </p>
      )}
      {targetRefresh.stale && !targetRefresh.loading && (
        <p role="status">Target facts stale/unavailable. Refresh to retry.</p>
      )}
      {children}
      <ul
        ref={rows}
        className={styles.dependencyRows}
        aria-label="Prerequisites"
      >
        {[...new Set([...original, ...value])].sort().map((uri, index) => {
          const { target, stale, owner, ownerStatus } = observeTarget(uri);
          const removed = !value.includes(uri);
          const added = !original.includes(uri);
          return (
            <li
              key={uri}
              className={removed ? styles.removedDependency : undefined}
            >
              <ActionIdentity
                uri={uri}
                title={target?.title ?? 'Action unavailable'}
                owner={owner}
                ownerStatus={ownerStatus}
              />
              <span className={styles.targetState}>
                {target
                  ? `${target.state} · ${target.satisfied ? 'Satisfied' : 'Unresolved'}${stale ? ' · Facts stale' : ''}`
                  : 'Facts unavailable'}
              </span>
              {(added || removed) && (
                <span className={styles.pendingChange}>
                  {removed ? 'Removed' : 'Added'}
                </span>
              )}
              <button
                data-membership
                type="button"
                className={styles.compactButton}
                disabled={disabled}
                aria-label={`${removed ? 'Undo removal of' : 'Remove'} prerequisite ${uri}`}
                onClick={() =>
                  removed ? onChange([...value, uri]) : remove(uri, index)
                }
              >
                {removed ? 'Undo' : 'Remove'}
              </button>
            </li>
          );
        })}
      </ul>
      <div
        ref={picker}
        className={styles.prerequisitePicker}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget) &&
            !(
              event.relatedTarget instanceof Element &&
              event.relatedTarget.closest('[data-blocking-refresh]')
            )
          )
            closePicker();
        }}
      >
        <button
          ref={addButton}
          type="button"
          className={styles.compactButton}
          disabled={disabled}
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
            searchInput.current?.focus();
          }}
        >
          + Add prerequisite
        </button>
        {original.length === 0 && value.length === 0 && (
          <span className={styles.targetOwner}> No prerequisites</span>
        )}
        {open && (
          <div ref={dropdown} className={styles.prerequisiteDropdown}>
            <label htmlFor="prerequisite-search">Add prerequisite</label>
            <input
              id="prerequisite-search"
              ref={searchInput}
              value={search}
              disabled={disabled}
              placeholder="Search Workspace titles or descriptions"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  options.current
                    ?.querySelector<HTMLButtonElement>(
                      'button[data-candidate]:not(:disabled)',
                    )
                    ?.focus();
                }
              }}
            />
            {loading && <p role="status">Finding Actions…</p>}
            {error && (
              <>
                <p role="alert">Lookup failed: {error}</p>
                <button
                  className={styles.compactButton}
                  type="button"
                  disabled={disabled || loading}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Retry prerequisite lookup
                </button>
              </>
            )}
            {!loading && !error && (
              <>
                {candidates.length === 0 && (
                  <p role="status">No Actions match this search.</p>
                )}
                <ul
                  ref={options}
                  className={styles.prerequisiteOptions}
                  aria-label="Prerequisite candidates"
                >
                  {candidates.map((uri) => {
                    const { target, stale, owner, ownerStatus } =
                      observeTarget(uri);
                    const title = target?.title ?? 'Action unavailable';
                    const selected = value.includes(uri);
                    return (
                      <li key={uri}>
                        <ActionIdentity
                          uri={uri}
                          title={title}
                          owner={owner}
                          ownerStatus={ownerStatus}
                        />
                        <span className={styles.targetState}>
                          {target
                            ? `${target.state}${stale ? ' · Facts stale' : ''}`
                            : 'Facts unavailable'}
                        </span>
                        <button
                          data-candidate
                          type="button"
                          className={styles.compactButton}
                          disabled={disabled || selected || !target}
                          aria-label={`Add prerequisite ${uri} ${title}`}
                          onClick={() => choose(uri)}
                        >
                          {selected
                            ? 'Already selected'
                            : !target
                              ? 'Unavailable'
                              : 'Add'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
