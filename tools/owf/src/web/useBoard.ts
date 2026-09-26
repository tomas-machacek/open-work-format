import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardResponse } from '../contracts/index.js';
import { fetchBoard } from './client.js';

export function useBoard(load: () => Promise<BoardResponse> = fetchBoard) {
  const [data, setData] = useState<BoardResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const pendingReturn = useRef(false);
  const refresh = useCallback(
    async function refresh(automatic = false) {
      if (automatic && inFlight.current) {
        pendingReturn.current = true;
        return;
      }
      pendingReturn.current = false;
      const request = ++generation.current;
      inFlight.current = true;
      setLoading(true);
      try {
        const next = await load();
        if (request !== generation.current || pendingReturn.current) return;
        setData(next);
        setError(undefined);
      } catch (failure) {
        if (request !== generation.current || pendingReturn.current) return;
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to read Actions.',
        );
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
  return { data, error, loading, refresh };
}
