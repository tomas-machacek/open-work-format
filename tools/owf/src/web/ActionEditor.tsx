import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { BoardAction, EditActionRequest } from '../contracts/index.js';
import { StateUpdateError } from './client.js';
import { OwnerPicker } from './OwnerPicker.js';
import styles from './Board.module.css';

const sameSnapshot = (a: BoardAction, b: BoardAction) =>
  a.title === b.title &&
  a.description === b.description &&
  a.owner.url === b.owner.url &&
  a.state === b.state &&
  a.waiting_for === b.waiting_for &&
  a.updated_at === b.updated_at;

export function ActionEditor({
  action,
  current,
  save,
  refresh,
  onSaved,
  onClose,
}: {
  action: BoardAction;
  current: BoardAction | undefined;
  save: (id: string, input: EditActionRequest) => Promise<BoardAction>;
  refresh: () => Promise<boolean>;
  onSaved: (action: BoardAction) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const [baseline, setBaseline] = useState(action);
  const [title, setTitle] = useState(action.title);
  const [description, setDescription] = useState(action.description ?? '');
  const [owner, setOwner] = useState(action.owner.url);
  const [reason, setReason] = useState(action.waiting_for ?? '');
  const [discard, setDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [error, setError] = useState<string>();
  const stale = !current || !sameSnapshot(baseline, current);
  const dirty =
    title !== baseline.title ||
    description !== (baseline.description ?? '') ||
    owner !== baseline.owner.url ||
    (baseline.state === 'waiting' && reason !== (baseline.waiting_for ?? ''));
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    titleInput.current?.focus();
    return () => node?.close();
  }, []);
  useLayoutEffect(() => {
    if (discard) continueButton.current?.focus();
    else if (dialog.current?.open) titleInput.current?.focus();
  }, [discard]);
  function requestClose() {
    if (saving) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  function reload() {
    if (!current) return;
    setBaseline(current);
    setTitle(current.title);
    setDescription(current.description ?? '');
    setOwner(current.owner.url);
    setReason(current.waiting_for ?? '');
    setBlocked(false);
    setInspected(false);
    setError(undefined);
    setDiscard(false);
    titleInput.current?.focus();
  }
  async function checkCurrent() {
    setInspected(await refresh());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || blocked || stale) return;
    const changes: Omit<EditActionRequest, 'expected'> = {};
    if (title !== baseline.title) changes.title = title;
    if (owner !== baseline.owner.url) changes.owner = owner;
    if (
      description !== (baseline.description ?? '') ||
      (description === '' && baseline.description !== undefined)
    ) {
      if (description === '' && baseline.description !== undefined)
        changes.clearDescription = true;
      else changes.description = description;
    }
    if (
      baseline.state === 'waiting' &&
      reason !== (baseline.waiting_for ?? '')
    ) {
      if (reason === '') changes.clearWaitingFor = true;
      else changes.waitingFor = reason;
    }
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const saved = await save(baseline.id, {
        expected: {
          title: baseline.title,
          ...(baseline.description === undefined
            ? {}
            : { description: baseline.description }),
          owner: baseline.owner,
          state: baseline.state,
          ...(baseline.waiting_for === undefined
            ? {}
            : { waiting_for: baseline.waiting_for }),
          updated_at: baseline.updated_at,
        },
        ...changes,
      });
      onSaved(saved);
      onClose();
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'Unable to save Action.';
      setError(message);
      if (
        failure instanceof StateUpdateError &&
        ['ACTION_CONFLICT', 'UNCERTAIN'].includes(failure.code)
      ) {
        setBlocked(true);
        void checkCurrent();
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.editor}
      aria-labelledby="editor-heading"
      aria-describedby="editor-intro"
      onCancel={(event) => {
        event.preventDefault();
        if (discard) setDiscard(false);
        else requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) requestClose();
      }}
    >
      <div className={styles.editorCard}>
        <p className={styles.eyebrow}>Action detail</p>
        <h2 id="editor-heading">Edit Action</h2>
        <p id="editor-intro" className={styles.editorIntro}>
          Change the details below. To change state, close this card and drag it
          to another column.
        </p>
        {discard ? (
          <div className={styles.editorNotice} role="alert">
            <strong>Discard unsaved changes?</strong>
            <p>Your edits will be lost.</p>
            <div className={styles.formButtons}>
              <button type="button" onClick={onClose}>
                Discard changes
              </button>
              <button
                ref={continueButton}
                type="button"
                onClick={() => {
                  setDiscard(false);
                }}
              >
                Continue editing
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
            noValidate
          >
            {stale && (
              <div className={styles.editorNotice} role="status">
                This Action changed on the board. Your draft is preserved.
                Reload current values before saving.
                <button type="button" onClick={reload} disabled={!current}>
                  Reload current values
                </button>
              </div>
            )}
            {blocked && !stale && (
              <div className={styles.editorNotice} role="status">
                Inspect the current Action before another save.
                <button
                  type="button"
                  onClick={() => {
                    void checkCurrent();
                  }}
                >
                  Refresh board
                </button>
                <button
                  type="button"
                  onClick={reload}
                  disabled={!current || !inspected}
                >
                  Use current values
                </button>
              </div>
            )}
            <label htmlFor="edit-title">Title</label>
            <input
              ref={titleInput}
              id="edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
            />
            <label htmlFor="edit-description">
              Description <span>(Markdown)</span>
            </label>
            <textarea
              id="edit-description"
              rows={6}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
            <OwnerPicker value={owner} onChange={setOwner} disabled={saving} />
            {baseline.state === 'waiting' && (
              <>
                <label htmlFor="edit-reason">
                  Waiting for <span>(optional)</span>
                </label>
                <textarea
                  id="edit-reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={saving}
                />
              </>
            )}
            <dl className={styles.editorMeta}>
              <div>
                <dt>State</dt>
                <dd>{baseline.state.replace('_', ' ')}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>{baseline.id}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{baseline.created_at}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{baseline.updated_at}</dd>
              </div>
            </dl>
            {error && (
              <p className={styles.formError} role="alert">
                {error}
              </p>
            )}
            {saving && (
              <p role="status" className={styles.hint}>
                Saving Action…
              </p>
            )}
            <div className={styles.formButtons}>
              <button type="submit" disabled={saving || blocked || stale}>
                Save changes
              </button>
              <button type="button" disabled={saving} onClick={requestClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
