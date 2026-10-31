import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Board.module.css';

const noop = () => {};
const fallback = { clear: noop, report: (_message: string) => {} };
const Feedback = createContext<{
  clear: () => void;
  report: (message: string) => void;
  surface: (node: HTMLElement) => () => void;
} | null>(null);

// Boundaries also let standalone boards/forms use the same behavior as Workspace.
export function Notifications({ children }: { children: ReactNode }) {
  const parent = useContext(Feedback);
  return parent ? children : <Provider>{children}</Provider>;
}

export function useFeedback() {
  return useContext(Feedback) ?? fallback;
}

// Native dialogs make the rest of the page inert. Portal the shared notification
// into the active dialog, outside its scrolling form content.
export function NotificationSurface() {
  const feedback = useContext(Feedback);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) return feedback?.surface(ref.current);
    return undefined;
  }, [feedback]);
  return <div ref={ref} />;
}

function Provider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ message: string; sequence: number }>();
  const sequence = useRef(0);
  const [surfaces, setSurfaces] = useState<HTMLElement[]>([]);
  const clear = useCallback(() => setNotice(undefined), []);
  const report = useCallback((message: string) => {
    setNotice({ message, sequence: ++sequence.current });
  }, []);
  const surface = useCallback((node: HTMLElement) => {
    setSurfaces((current) => [...current, node]);
    return () =>
      setSurfaces((current) => current.filter((item) => item !== node));
  }, []);
  const value = useMemo(
    () => ({ clear, report, surface }),
    [clear, report, surface],
  );
  const lifetime = useLifetime(notice?.sequence, clear);
  const notification = notice && (
    <Notification notice={notice} dismiss={clear} lifetime={lifetime} />
  );
  const target = surfaces.at(-1);
  const { release } = lifetime;
  useEffect(release, [target, release]);
  return (
    <Feedback.Provider value={value}>
      {children}
      {target ? createPortal(notification, target) : notification}
    </Feedback.Provider>
  );
}

function useLifetime(sequence: number | undefined, dismiss: () => void) {
  const enabled = useRef(false);
  const hovered = useRef(false);
  const focused = useRef(false);
  const remaining = useRef(8000);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started.current),
      );
    }
  }, []);
  const resume = useCallback(() => {
    if (
      !enabled.current ||
      hovered.current ||
      focused.current ||
      timer.current !== undefined
    )
      return;
    started.current = Date.now();
    timer.current = setTimeout(dismiss, remaining.current);
  }, [dismiss]);
  useEffect(() => {
    stop();
    enabled.current = sequence !== undefined;
    if (sequence === undefined) {
      hovered.current = false;
      focused.current = false;
    }
    remaining.current = 8000;
    if (sequence !== undefined) resume();
    return () => {
      enabled.current = false;
      stop();
    };
  }, [sequence, resume, stop]);
  const release = useCallback(() => {
    hovered.current = false;
    focused.current = false;
    resume();
  }, [resume]);
  return { hovered, focused, stop, resume, release };
}

function Notification({
  notice,
  dismiss,
  lifetime,
}: {
  notice: { message: string; sequence: number };
  dismiss: () => void;
  lifetime: ReturnType<typeof useLifetime>;
}) {
  const region = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const { hovered, focused, stop, resume } = lifetime;
  return (
    <div
      ref={region}
      className={styles.notification}
      aria-label="Operation error"
      onMouseEnter={() => {
        hovered.current = true;
        stop();
      }}
      onMouseLeave={() => {
        hovered.current = false;
        resume();
      }}
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          previousFocus.current =
            event.relatedTarget instanceof HTMLElement &&
            event.relatedTarget !== document.body
              ? event.relatedTarget
              : null;
        focused.current = true;
        stop();
      }}
      onBlurCapture={(event) => {
        focused.current = event.currentTarget.contains(event.relatedTarget);
        resume();
      }}
    >
      <div role="alert" key={notice.sequence}>
        {notice.message}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => {
          if (region.current?.contains(document.activeElement)) {
            const surface =
              region.current.closest('dialog, [role="dialog"]') ??
              [...document.querySelectorAll('main')].find(
                (main) => !main.closest('[hidden]'),
              );
            const target =
              previousFocus.current?.isConnected &&
              !previousFocus.current.matches(':disabled') &&
              surface?.contains(previousFocus.current)
                ? previousFocus.current
                : (surface?.querySelector<HTMLElement>(
                    'input:not(:disabled)',
                  ) ??
                  surface?.querySelector<HTMLElement>(
                    'button:not(:disabled):not([style*="hidden"])',
                  ));
            target?.focus({ preventScroll: true });
          }
          dismiss();
        }}
      >
        ×
      </button>
    </div>
  );
}
