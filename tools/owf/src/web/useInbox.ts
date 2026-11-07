import { useCallback, useEffect, useRef, useState } from 'react';
import type { InboxItem } from '../contracts/index.js';
import {
  fetchInbox,
  fetchWorkspaceIdentity,
  writeInbox,
} from './inboxClient.js';
import { StateUpdateError } from './client.js';
import { useFeedback } from './Notifications.js';

export function useInbox() {
  const feedback = useFeedback();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [root, setRoot] = useState<string>();
  const [shown, setShown] = useState(true);
  const [stale, setStale] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [inspected, setInspected] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const preferenceLoaded = useRef(false);
  const toggled = useRef(false);
  const visible = useRef(shown);
  visible.current = shown;
  const lastFailure = useRef<string | undefined>(undefined);
  const identify = useCallback((workspaceRoot: string) => {
    setRoot(workspaceRoot);
    if (preferenceLoaded.current) return;
    preferenceLoaded.current = true;
    try {
      const key = `owf:inbox:${workspaceRoot}`;
      if (toggled.current) localStorage.setItem(key, String(visible.current));
      else setShown(localStorage.getItem(key) !== 'false');
    } catch {
      /* Browser preferences are optional. */
    }
  }, []);
  const refresh = useCallback(
    async (automatic = false) => {
      if (busy.current) return false;
      if (!automatic) feedback.clear();
      const request = ++generation.current;
      setLoading(true);
      try {
        const next = await fetchInbox();
        if (!alive.current || request !== generation.current) return false;
        setItems(next.items);
        identify(next.workspace.root);
        setStale(false);
        if (!automatic) setInspected(true);
        lastFailure.current = undefined;
        return true;
      } catch (error) {
        if (!alive.current || request !== generation.current) return false;
        setStale(true);
        const message =
          error instanceof Error ? error.message : 'Unable to read Inbox.';
        if (!automatic || message !== lastFailure.current)
          feedback.report(
            `Inbox could not be refreshed. ${message} Use Refresh Inbox.`,
          );
        lastFailure.current = message;
        return false;
      } finally {
        if (alive.current && request === generation.current) setLoading(false);
      }
    },
    [feedback, identify],
  );
  useEffect(() => {
    alive.current = true;
    void fetchWorkspaceIdentity().then(
      (root) => {
        if (alive.current) identify(root);
      },
      () => {
        /* Inbox reads also supply identity if this optional request fails. */
      },
    );
    void refresh(true);
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const returned = () => {
      if (!visible.current || document.visibilityState === 'hidden') return;
      clearTimeout(scheduled);
      scheduled = setTimeout(() => {
        scheduled = undefined;
        if (visible.current) void refresh(true);
      }, 100);
    };
    window.addEventListener('focus', returned);
    document.addEventListener('visibilitychange', returned);
    return () => {
      alive.current = false;
      ++generation.current;
      clearTimeout(scheduled);
      window.removeEventListener('focus', returned);
      document.removeEventListener('visibilitychange', returned);
    };
  }, [refresh, identify]);
  function toggle() {
    toggled.current = true;
    const next = !shown;
    setShown(next);
    visible.current = next;
    if (root) {
      try {
        localStorage.setItem(`owf:inbox:${root}`, String(next));
      } catch {
        /* Capture and session visibility do not depend on storage. */
      }
    }
    if (next) void refresh();
  }
  async function mutate(
    operation: Parameters<typeof writeInbox>[0],
    text: string,
    id?: string,
  ) {
    if (busy.current || uncertain) return false;
    busy.current = true;
    ++generation.current;
    setLoading(false);
    setPending(true);
    feedback.clear();
    try {
      const saved = await writeInbox(operation, text, id);
      if (!alive.current) return false;
      ++generation.current;
      // Confirmed snapshots survive failed follow-up queries; old reads were invalidated.
      setItems((current) =>
        saved
          ? [...current.filter((item) => item.id !== saved.id), saved].sort(
              (a, b) =>
                a.captured_at.localeCompare(b.captured_at) ||
                a.id.localeCompare(b.id),
            )
          : current.filter((item) => item.id !== id),
      );
      busy.current = false;
      if (visible.current) void refresh(true);
      return true;
    } catch (error) {
      if (!alive.current) return false;
      feedback.report(
        error instanceof Error ? error.message : 'Unable to write Inbox.',
      );
      if (error instanceof StateUpdateError && error.code === 'UNCERTAIN') {
        setUncertain(true);
        setInspected(false);
        setStale(true);
      }
      if (
        error instanceof StateUpdateError &&
        error.code === 'INBOX_NOT_FOUND'
      ) {
        busy.current = false;
        void refresh(true);
      }
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return {
    items,
    shown,
    stale,
    loading,
    pending,
    uncertain,
    inspected,
    refresh,
    toggle,
    mutate,
    acknowledge: () => {
      if (inspected && !stale) setUncertain(false);
    },
  };
}
