import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BoardResponse,
  BoardAction,
  BoardQuery,
} from '../contracts/index.js';
import { boardAction } from '../contracts/index.js';
import { fetchBoard } from './client.js';
import { useFeedback } from './Notifications.js';

export function useBoard(
  load: (query: BoardQuery) => Promise<BoardResponse> = fetchBoard,
  active = true,
  onRefresh?: (automatic?: boolean) => void,
) {
  const { clear, report } = useFeedback();
  const lastFailure = useRef<string | undefined>(undefined);
  const completedWritePending = useRef<string | undefined>(undefined);
  const [query, setQuery] = useState<BoardQuery>({});
  const scope = useRef<BoardQuery>({});
  const resultScope = useRef<BoardQuery>({});
  const [resultQuery, setResultQuery] = useState<BoardQuery>({});
  const tracked = useRef<string | undefined>(undefined);
  const [current, setCurrent] = useState<BoardAction>();
  const track = (action: BoardAction | undefined) => {
    tracked.current = action?.id;
    setCurrent(
      action ? (accepted.current.get(action.id)?.action ?? action) : undefined,
    );
  };
  const [data, setData] = useState<BoardResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [membershipPending, setMembershipPending] = useState(false);
  const generation = useRef(0);
  const writes = useRef(0);
  const accepted = useRef(
    new Map<string, { action: BoardAction; revision: number }>(),
  );
  const accept = useCallback((action: BoardAction) => {
    accepted.current.set(action.id, { action, revision: ++writes.current });
    if (tracked.current === action.id) setCurrent(action);
    const filtered =
      scope.current.search !== undefined || scope.current.owner !== undefined;
    if (filtered) setMembershipPending(true);
    const insert =
      !filtered &&
      JSON.stringify(resultScope.current) === JSON.stringify(scope.current);
    // Replace known cards with the confirmed snapshot without inferring filter
    // membership or inserting a saved Action into an unconfirmed selection.
    setData(
      (current) =>
        current && {
          ...current,
          actions: insert
            ? merge(current.actions, [action])
            : current.actions.map((item) =>
                item.id === action.id ? action : item,
              ),
        },
    );
  }, []);
  const remove = useCallback((id: string) => {
    ++generation.current;
    ++writes.current;
    accepted.current.delete(id);
    setData(
      (current) =>
        current && {
          ...current,
          actions: current.actions.filter((a) => a.id !== id),
        },
    );
    if (tracked.current === id) setCurrent(undefined);
  }, []);
  useEffect(() => {
    const deleted = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string')
        remove(event.detail);
    };
    const created = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const parsed = boardAction.safeParse(event.detail);
      if (parsed.success) accept(parsed.data);
    };
    window.addEventListener('owf-action-created', created);
    window.addEventListener('owf-action-deleted', deleted);
    return () => {
      window.removeEventListener('owf-action-deleted', deleted);
      window.removeEventListener('owf-action-created', created);
    };
  }, [remove, accept]);
  const inFlight = useRef(false);
  const pendingReturn = useRef(false);
  const refresh = useCallback(
    async function refresh(automatic = false, completedWrite?: string) {
      if (completedWrite) completedWritePending.current = completedWrite;
      // A confirmed write needs a new snapshot immediately; only background
      // refreshes can wait for an existing read to finish.
      if (automatic && !completedWrite && inFlight.current) {
        pendingReturn.current = true;
        return false;
      }
      pendingReturn.current = false;
      if (!automatic) clear();
      const request = ++generation.current;
      const revision = writes.current;
      const selection = scope.current;
      inFlight.current = true;
      setLoading(true);
      onRefresh?.(automatic);
      try {
        const next = await load(selection);
        if (request !== generation.current || pendingReturn.current)
          return false;
        // Filter membership must be determined by a read after every confirmed
        // write, never by browser matching or insertion into another scope.
        if (
          revision !== writes.current &&
          (selection.search !== undefined || selection.owner !== undefined)
        ) {
          pendingReturn.current = true;
          return false;
        }
        let snapshot = next.actions.find(
          (action) => action.id === tracked.current,
        );
        if (
          tracked.current &&
          !snapshot &&
          (selection.search !== undefined || selection.owner !== undefined)
        ) {
          const all = await load({});
          if (request !== generation.current || pendingReturn.current)
            return false;
          snapshot = all.actions.find(
            (action) => action.id === tracked.current,
          );
        }
        if (
          revision !== writes.current &&
          (selection.search !== undefined || selection.owner !== undefined)
        ) {
          pendingReturn.current = true;
          return false;
        }
        if (tracked.current) {
          const confirmed = accepted.current.get(tracked.current);
          setCurrent(
            confirmed && confirmed.revision > revision
              ? confirmed.action
              : snapshot,
          );
        }
        // Only a read started after confirmation can reconcile that write.
        const newer = [...accepted.current.values()].filter(
          (entry) => entry.revision > revision,
        );
        for (const [id, entry] of accepted.current) {
          if (entry.revision <= revision) accepted.current.delete(id);
        }
        const resolved = {
          ...next,
          actions: merge(
            next.actions,
            newer.map((entry) => entry.action),
          ),
        };
        setData(resolved);
        setResultQuery(selection);
        resultScope.current = selection;
        setMembershipPending(false);
        setError(undefined);
        lastFailure.current = undefined;
        completedWritePending.current = undefined;
        return true;
      } catch (failure) {
        if (request !== generation.current || pendingReturn.current)
          return false;
        const message =
          failure instanceof Error
            ? failure.message
            : 'Unable to read Actions.';
        setError(message);
        if (!automatic || message !== lastFailure.current)
          report(
            `${completedWritePending.current ? `${completedWritePending.current} completed. Do not repeat the write. ` : ''}Board refresh failed: ${message} Use Retry to read the Workspace again.`,
          );
        lastFailure.current = message;
        return false;
      } finally {
        if (request === generation.current) {
          inFlight.current = false;
          // A return can follow a CLI write after this request read its snapshot.
          // Keep the cards and progress state until that return has its own read.
          if (pendingReturn.current) void refresh(true, completedWrite);
          else setLoading(false);
        }
      }
    },
    [load, onRefresh, clear, report],
  );
  const apply = (next: BoardQuery) => {
    scope.current = next;
    setQuery(next);
    void refresh();
  };
  useEffect(() => {
    if (!active) return;
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh(true);
      }, 100);
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      ++generation.current;
      inFlight.current = false;
      pendingReturn.current = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [refresh, active]);
  return {
    data,
    error,
    loading,
    membershipPending,
    refresh,
    accept,
    remove,
    query,
    resultQuery,
    apply,
    track,
    current,
  };
}

function merge(actions: BoardAction[], confirmed: BoardAction[]) {
  const byId = new Map(actions.map((action) => [action.id, action]));
  for (const action of confirmed) byId.set(action.id, action);
  return [...byId.values()].sort((a, b) =>
    a.created_at === b.created_at
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.created_at > b.created_at
        ? -1
        : 1,
  );
}
