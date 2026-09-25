import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardResponse } from '../contracts/index.js';
import { fetchBoard } from './client.js';

export function useBoard(load: () => Promise<BoardResponse> = fetchBoard) {
  const [data, setData] = useState<BoardResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const refresh = useCallback(
    async (automatic = false) => {
      if (automatic && inFlight.current) return;
      const request = ++generation.current;
      inFlight.current = true;
      setLoading(true);
      try {
        const next = await load();
        if (request !== generation.current) return;
        setData(next);
        setError(undefined);
      } catch (failure) {
        if (request !== generation.current) return;
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to read Actions.',
        );
      } finally {
        if (request === generation.current) {
          inFlight.current = false;
          setLoading(false);
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
      clearTimeout(timer);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
