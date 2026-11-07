import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { InboxItem } from '../contracts/index.js';
import { NotificationSurface } from './Notifications.js';
import { useInbox } from './useInbox.js';
import styles from './Inbox.module.css';

type InboxState = ReturnType<typeof useInbox>;

export function Inbox() {
  const inbox = useInbox();
  const [capture, setCapture] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState<InboxItem>();
  const captureField = useRef<HTMLTextAreaElement>(null);
  const captureRevision = useRef(0);
  const opener = useRef<HTMLButtonElement | null>(null);
  const restore = useRef(false);
  useLayoutEffect(() => {
    if (!selected && restore.current) {
      restore.current = false;
      if (opener.current?.isConnected) opener.current.focus();
      else captureField.current?.focus();
    }
  }, [selected]);
  return (
    <aside className={styles.inbox} aria-labelledby="inbox-heading">
      <div className={styles.capture}>
        <div className={styles.heading}>
          <h2 id="inbox-heading">Inbox</h2>
          <button
            type="button"
            aria-expanded={inbox.shown}
            aria-controls="inbox-list"
            onClick={inbox.toggle}
          >
            {inbox.shown ? 'Hide Inbox' : 'Show Inbox'}
            {!inbox.stale ? ` (${inbox.items.length})` : ''}
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (inbox.pending || inbox.uncertain) return;
            if (!capture.trim()) {
              setInvalid(true);
              captureField.current?.focus();
              return;
            }
            const submitted = capture;
            const revision = captureRevision.current;
            void inbox.mutate('capture', submitted).then((saved) => {
              if (saved && revision === captureRevision.current) setCapture('');
            });
          }}
        >
          <label htmlFor="inbox-capture">Capture a thought</label>
          <textarea
            id="inbox-capture"
            ref={captureField}
            rows={2}
            value={capture}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'capture-error' : undefined}
            onChange={(event) => {
              ++captureRevision.current;
              setCapture(event.target.value);
              setInvalid(false);
            }}
          />
          {invalid && (
            <p id="capture-error" role="alert">
              Enter nonblank Inbox text.
            </p>
          )}
          <button type="submit" disabled={inbox.pending || inbox.uncertain}>
            Add to Inbox
          </button>
        </form>
        <div className={styles.recovery}>
          {inbox.stale && (
            <span role="status">
              Inbox not current. Confirmed writes are retained.
            </span>
          )}
          <button
            type="button"
            disabled={inbox.pending || inbox.loading}
            onClick={() => {
              void inbox.refresh();
            }}
          >
            {inbox.loading ? 'Refreshing Inbox…' : 'Refresh Inbox'}
          </button>
        </div>
        {inbox.uncertain && (
          <div role="status" className={styles.uncertain}>
            Write outcome unknown.{' '}
            {inbox.shown
              ? 'Refresh Inbox and inspect the list.'
              : 'Show Inbox to inspect the list.'}{' '}
            Your draft is retained.
          </div>
        )}
      </div>
      <div id="inbox-list" className={styles.list} hidden={!inbox.shown}>
        {inbox.uncertain && (
          <div className={styles.uncertain}>
            <button
              type="button"
              disabled={
                !inbox.shown || !inbox.inspected || inbox.stale || inbox.loading
              }
              onClick={() => {
                inbox.acknowledge();
                captureField.current?.focus();
              }}
            >
              I inspected Inbox; allow writes
            </button>
          </div>
        )}
        {!inbox.stale && inbox.items.length === 0 && <p>Inbox is empty.</p>}
        <ol aria-label="Inbox Items, oldest first">
          {inbox.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={styles.item}
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setSelected(item);
                }}
              >
                <time dateTime={item.captured_at}>
                  {new Date(item.captured_at).toLocaleString()}
                </time>
                <span>{item.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      {selected && (
        <InboxEditor
          item={selected}
          inbox={inbox}
          onClose={() => {
            restore.current = true;
            setSelected(undefined);
          }}
        />
      )}
    </aside>
  );
}

function InboxEditor({
  item,
  inbox,
  onClose,
}: {
  item: InboxItem;
  inbox: InboxState;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const [baseline, setBaseline] = useState(item.text);
  const [text, setText] = useState(item.text);
  const [invalid, setInvalid] = useState(false);
  const [confirmation, setConfirmation] = useState<'close' | 'discard'>();
  const dirty = text !== baseline;
  const current = inbox.items.find((candidate) => candidate.id === item.id);
  // Preserve the draft, but do not treat a refreshed replacement as the text
  // the user has inspected. Keep this guard even if a later refresh fails.
  const changed = current !== undefined && current.text !== baseline;
  const missing = !inbox.stale && !inbox.loading && current === undefined;
  const blocked = inbox.pending || inbox.uncertain || missing || changed;
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    field.current?.focus();
    return () => node?.close();
  }, []);
  useLayoutEffect(() => {
    if (confirmation) continueButton.current?.focus();
    else field.current?.focus();
  }, [confirmation]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty || inbox.pending || inbox.uncertain) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, inbox.pending, inbox.uncertain]);
  function close() {
    if (inbox.pending) return;
    if (dirty) setConfirmation('close');
    else onClose();
  }
  async function consume(operation: 'resolve' | 'discard') {
    if (blocked || (operation === 'resolve' && dirty)) return;
    if (await inbox.mutate(operation, '', item.id)) onClose();
    else setConfirmation(undefined);
  }
  return (
    <dialog
      className={styles.editor}
      ref={dialog}
      aria-labelledby="inbox-detail-heading"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'textarea:not(:disabled), button:not(:disabled)',
          ),
        ];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (inbox.pending) return;
        if (confirmation) setConfirmation(undefined);
        else close();
      }}
    >
      <NotificationSurface />
      <form
        className={styles.editorForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked) return;
          if (!text.trim()) {
            setInvalid(true);
            field.current?.focus();
            return;
          }
          const submitted = text;
          void inbox.mutate('save', submitted, item.id).then((saved) => {
            if (saved) setBaseline(submitted);
          });
        }}
      >
        <h2 id="inbox-detail-heading">Inbox Item</h2>
        <p className={styles.identity}>
          <time dateTime={item.captured_at}>
            {new Date(item.captured_at).toLocaleString()}
          </time>{' '}
          · {item.id}
        </p>
        {missing && (
          <p role="status">
            This Inbox Item is missing; it may have been resolved or discarded
            elsewhere. Copy your text to recover it.
          </p>
        )}
        <label htmlFor="inbox-text">Full Inbox text</label>
        <textarea
          ref={field}
          id="inbox-text"
          value={text}
          readOnly={inbox.pending}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'inbox-edit-error' : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setInvalid(false);
          }}
        />
        <div className={styles.controls}>
          {invalid && (
            <p id="inbox-edit-error" role="alert">
              Enter nonblank Inbox text.
            </p>
          )}
          {inbox.stale && (
            <p role="status">
              Inbox not current. Confirmed writes remain saved.
            </p>
          )}
          {changed && !inbox.uncertain && (
            <div role="group" aria-label="External Inbox changes">
              <p role="status">
                This Inbox Item changed elsewhere. Your text is retained.
                Inspect the current text before saving or consuming the item.
              </p>
              <pre className={styles.current}>{current.text}</pre>
              <div className={styles.buttons}>
                <button
                  type="button"
                  disabled={inbox.pending || inbox.loading || inbox.stale}
                  onClick={() => {
                    setBaseline(current.text);
                    setText(current.text);
                    setInvalid(false);
                    field.current?.focus();
                  }}
                >
                  Replace draft with current text
                </button>
                <button
                  type="button"
                  disabled={inbox.pending || inbox.loading || inbox.stale}
                  onClick={() => {
                    setBaseline(current.text);
                    field.current?.focus();
                  }}
                >
                  Keep my draft for saving
                </button>
              </div>
            </div>
          )}
          {inbox.uncertain && (
            <div role="status">
              Write outcome unknown. Refresh and inspect current Inbox text
              before allowing writes.
              <button
                type="button"
                disabled={inbox.pending || inbox.loading}
                onClick={() => {
                  void inbox.refresh();
                }}
              >
                Refresh Inbox
              </button>
              {!inbox.stale && inbox.inspected && (
                <>
                  <pre className={styles.current}>
                    {current?.text ?? 'Item no longer exists.'}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      inbox.acknowledge();
                      field.current?.focus();
                    }}
                  >
                    I inspected Inbox; allow writes
                  </button>
                </>
              )}
            </div>
          )}
          {confirmation ? (
            <div
              role="group"
              aria-label={
                confirmation === 'discard'
                  ? 'Confirm discard'
                  : 'Unsaved changes'
              }
            >
              <p>
                {confirmation === 'discard'
                  ? `Discard Inbox Item ${item.id}? Its current text and any unsaved edits will be removed.`
                  : 'Discard unsaved Inbox changes?'}
              </p>
              <button
                ref={continueButton}
                type="button"
                disabled={inbox.pending}
                onClick={() => setConfirmation(undefined)}
              >
                Continue editing
              </button>
              <button
                type="button"
                className={styles.destructive}
                disabled={
                  inbox.pending || (confirmation === 'discard' && blocked)
                }
                onClick={() => {
                  if (confirmation === 'discard') void consume('discard');
                  else onClose();
                }}
              >
                {confirmation === 'discard'
                  ? 'Confirm discard'
                  : 'Discard changes'}
              </button>
            </div>
          ) : (
            <>
              <p>
                Resolve only when you have finished the intended processing. It
                creates no other object.
                {dirty ? ' Save changes before resolving.' : ''}
              </p>
              <div className={styles.buttons}>
                <button type="submit" disabled={blocked}>
                  Save changes
                </button>
                <button type="button" disabled={inbox.pending} onClick={close}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={blocked || dirty}
                  onClick={() => {
                    void consume('resolve');
                  }}
                >
                  Resolve
                </button>
                <button
                  type="button"
                  className={styles.destructive}
                  disabled={blocked}
                  onClick={() => setConfirmation('discard')}
                >
                  Discard
                </button>
              </div>
              {!inbox.uncertain && (
                <button
                  type="button"
                  disabled={inbox.pending || inbox.loading}
                  onClick={() => {
                    void inbox.refresh();
                  }}
                >
                  Refresh Inbox
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
