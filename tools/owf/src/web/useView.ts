import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewResponse } from '../contracts/index.js';
import { fetchView } from './client.js';

export function useView(id: string, onRefresh: () => void, load = fetchView) {
  const [data, setData] = useState<ViewResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const pendingReturn = useRef(false);
  const refresh = useCallback(
    async function refresh(automatic = false): Promise<boolean> {
      if (automatic && inFlight.current) {
        pendingReturn.current = true;
        return false;
      }
      pendingReturn.current = false;
      const request = ++generation.current;
      inFlight.current = true;
      setLoading(true);
      onRefresh();
      try {
        const next = await load(id);
        if (request !== generation.current || pendingReturn.current)
          return false;
        setData(next);
        setError(undefined);
        return true;
      } catch (failure) {
        if (request !== generation.current || pendingReturn.current)
          return false;
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to evaluate View.',
        );
        return false;
      } finally {
        if (request === generation.current) {
          inFlight.current = false;
          if (pendingReturn.current) void refresh();
          else setLoading(false);
        }
      }
    },
    [id, onRefresh, load],
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
