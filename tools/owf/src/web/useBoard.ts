import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BoardResponse,
  BoardAction,
  BoardQuery,
} from '../contracts/index.js';
import { fetchBoard } from './client.js';

export function useBoard(
  load: (query: BoardQuery) => Promise<BoardResponse> = fetchBoard,
) {
  const [query, setQuery] = useState<BoardQuery>({});
  const scope = useRef<BoardQuery>({});
  const resultScope = useRef<BoardQuery>({});
  const [resultQuery, setResultQuery] = useState<BoardQuery>({});
  const tracked = useRef<string | undefined>(undefined);
  const latest = useRef<BoardResponse | undefined>(undefined);
  const [current, setCurrent] = useState<BoardAction>();
  const track = (action: BoardAction | undefined) => {
    tracked.current = action?.id;
    setCurrent(action);
  };
  const [data, setData] = useState<BoardResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const writes = useRef(0);
  const accepted = useRef(
    new Map<string, { action: BoardAction; revision: number }>(),
  );
  const accept = useCallback((action: BoardAction) => {
    accepted.current.set(action.id, { action, revision: ++writes.current });
    if (tracked.current === action.id) setCurrent(action);
    if (scope.current.search !== undefined || scope.current.owner !== undefined)
      return;
    if (JSON.stringify(resultScope.current) !== JSON.stringify(scope.current))
      return;
    setData(
      (current) =>
        current && { ...current, actions: merge(current.actions, [action]) },
    );
  }, []);
  const inFlight = useRef(false);
  const pendingReturn = useRef(false);
  const refresh = useCallback(
    async function refresh(automatic = false) {
      if (automatic && inFlight.current) {
        pendingReturn.current = true;
        return false;
      }
      pendingReturn.current = false;
      const request = ++generation.current;
      const revision = writes.current;
      const selection = scope.current;
      inFlight.current = true;
      setLoading(true);
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
        latest.current = resolved;
        setData(resolved);
        setResultQuery(selection);
        resultScope.current = selection;
        setError(undefined);
        return true;
      } catch (failure) {
        if (request !== generation.current || pendingReturn.current)
          return false;
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to read Actions.',
        );
        return false;
      } finally {
        if (request === generation.current) {
          inFlight.current = false;
          // A return can follow a CLI write after this request read its snapshot.
          // Keep the cards and progress state until that return has its own read.
          if (pendingReturn.current) void refresh();
          else setLoading(false);
        }
      }
    },
    [load],
  );
  const apply = (next: BoardQuery) => {
    scope.current = next;
    setQuery(next);
    void refresh();
  };
  useEffect(() => {
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
  }, [refresh]);
  return {
    data,
    error,
    loading,
    refresh,
    accept,
    query,
    resultQuery,
    apply,
    track,
    current,
    isFiltered: () =>
      scope.current.search !== undefined || scope.current.owner !== undefined,
    includes: (id: string) =>
      latest.current?.actions.some((action) => action.id === id) ?? false,
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
