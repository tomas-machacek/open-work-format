import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { ViewResponse } from '../contracts/index.js';
import { fetchView } from './client.js';
import { useFeedback } from './Notifications.js';

export function useView(
  id: string,
  onRefresh: (automatic?: boolean) => void,
  load = fetchView,
  frozen?: RefObject<boolean>,
) {
  const { clear, report } = useFeedback();
  const lastFailure = useRef<string | undefined>(undefined);
  const completedWritePending = useRef<string | undefined>(undefined);
  const [data, setData] = useState<ViewResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const pendingReturn = useRef(false);
  const refresh = useCallback(
    async function refresh(
      automatic = false,
      completedWrite?: string,
    ): Promise<boolean> {
      if (completedWrite) completedWritePending.current = completedWrite;
      if (frozen?.current) {
        pendingReturn.current = true;
        return false;
      }
      if (automatic && inFlight.current) {
        pendingReturn.current = true;
        return false;
      }
      pendingReturn.current = false;
      if (!automatic) clear();
      const request = ++generation.current;
      inFlight.current = true;
      setLoading(true);
      onRefresh(automatic);
      try {
        const next = await load(id);
        if (frozen?.current) {
          pendingReturn.current = true;
          return false;
        }
        if (request !== generation.current || pendingReturn.current)
          return false;
        setData(next);
        setError(undefined);
        lastFailure.current = undefined;
        completedWritePending.current = undefined;
        return true;
      } catch (failure) {
        if (frozen?.current) {
          pendingReturn.current = true;
          return false;
        }
        if (request !== generation.current || pendingReturn.current)
          return false;
        const message =
          failure instanceof Error
            ? failure.message
            : 'Unable to evaluate View.';
        setError(message);
        if (!automatic || message !== lastFailure.current)
          report(
            `${completedWritePending.current ? `${completedWritePending.current} completed. Do not repeat the write. ` : ''}View refresh failed: ${message} Use Retry or select Default Kanban.`,
          );
        lastFailure.current = message;
        return false;
      } finally {
        if (request === generation.current) {
          inFlight.current = false;
          if (pendingReturn.current) void refresh(true, completedWrite);
          else setLoading(false);
        }
      }
    },
    [id, onRefresh, load, frozen, clear, report],
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
  function accept(change: (data: ViewResponse) => ViewResponse) {
    ++generation.current;
    setData((current) => current && change(current));
  }
  return { data, error, loading, refresh, accept };
}
