import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardResponse, BoardAction } from '../contracts/index.js';
import { fetchBoard } from './client.js';

export function useBoard(load: () => Promise<BoardResponse> = fetchBoard) {
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
      inFlight.current = true;
      setLoading(true);
      try {
        const next = await load();
        if (request !== generation.current || pendingReturn.current)
          return false;
        // Only a read started after confirmation can reconcile that write.
        const newer = [...accepted.current.values()].filter(
          (entry) => entry.revision > revision,
        );
        for (const [id, entry] of accepted.current) {
          if (entry.revision <= revision) accepted.current.delete(id);
        }
        setData({
          ...next,
          actions: merge(
            next.actions,
            newer.map((entry) => entry.action),
          ),
        });
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
  return { data, error, loading, refresh, accept };
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
