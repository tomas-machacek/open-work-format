import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
  type ReactNode,
  type FormEvent,
} from 'react';
import type { BoardAction, EditActionRequest } from '../contracts/index.js';
import { StateUpdateError } from './client.js';
import { OwnerPicker } from './OwnerPicker.js';
import { PrerequisitePicker } from './PrerequisitePicker.js';
import styles from './Board.module.css';

const sameSnapshot = (a: BoardAction, b: BoardAction) =>
  a.title === b.title &&
  a.description === b.description &&
  a.owner.url === b.owner.url &&
  a.state === b.state &&
  a.waiting_for === b.waiting_for &&
  a.manual_block === b.manual_block &&
  JSON.stringify(a.depends_on) === JSON.stringify(b.depends_on) &&
  a.updated_at === b.updated_at;

export interface EditorNavigation {
  requestClose: (afterClose: () => void) => void;
}

export function ActionEditor({
  action,
  current,
  factsStale = false,
  save,
  refresh,
  onSaved,
  onClose,
  navigationRef,
  navigation,
  passive = false,
}: {
  action: BoardAction;
  current: BoardAction | undefined;
  factsStale?: boolean;
  save: (id: string, input: EditActionRequest) => Promise<BoardAction>;
  refresh: () => Promise<boolean>;
  onSaved: (action: BoardAction) => void;
  onClose: () => void;
  navigationRef?: Ref<EditorNavigation>;
  navigation?: ReactNode;
  passive?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const [baseline, setBaseline] = useState(action);
  const [title, setTitle] = useState(action.title);
  const [description, setDescription] = useState(action.description ?? '');
  const [owner, setOwner] = useState(action.owner.url);
  const [reason, setReason] = useState(action.waiting_for ?? '');
  const [manual, setManual] = useState(action.manual_block !== undefined);
  const [manualReason, setManualReason] = useState(action.manual_block ?? '');
  const [dependencies, setDependencies] = useState(action.depends_on);
  const manualEligible = !['completed', 'cancelled'].includes(baseline.state);
  const manualDirty =
    manual !== (baseline.manual_block !== undefined) ||
    (manual && manualReason !== baseline.manual_block);
  const dependencyDirty =
    dependencies.length !== baseline.depends_on.length ||
    dependencies.some((uri) => !baseline.depends_on.includes(uri));
  const [discard, setDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const [blocked, setBlocked] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [error, setError] = useState<string>();
  const stale = !current || !sameSnapshot(baseline, current);
  const dirty =
    manualDirty ||
    dependencyDirty ||
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
  function close() {
    onClose();
    afterClose.current?.();
    afterClose.current = undefined;
  }
  function requestClose(next?: () => void) {
    if (saving) return;
    afterClose.current = next;
    if (dirty) setDiscard(true);
    else close();
  }
  useImperativeHandle(navigationRef, () => ({ requestClose }));
  function reload() {
    if (!current) return;
    setBaseline(current);
    setTitle(current.title);
    setDescription(current.description ?? '');
    setOwner(current.owner.url);
    setReason(current.waiting_for ?? '');
    setManual(current.manual_block !== undefined);
    setManualReason(current.manual_block ?? '');
    setDependencies(current.depends_on);
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
    if (saving || blocked || stale || (passive && factsStale)) return;
    if (manual && !manualReason.trim()) {
      setError('Enter a nonblank manual blocking reason.');
      return;
    }
    const changes: Omit<EditActionRequest, 'expected'> = {};
    if (manualDirty) {
      if (manual) changes.manualBlock = manualReason;
      else changes.clearManualBlock = true;
    }
    const added = dependencies.filter(
      (uri) => !baseline.depends_on.includes(uri),
    );
    const removed = baseline.depends_on.filter(
      (uri) => !dependencies.includes(uri),
    );
    if (added.length) changes.addDependency = added;
    if (removed.length) changes.removeDependency = removed;
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
        if (discard) {
          setDiscard(false);
          afterClose.current = undefined;
        } else requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) requestClose();
      }}
    >
      <div className={styles.editorCard}>
        {navigation}
        <p className={styles.eyebrow}>Action detail</p>
        <h2 id="editor-heading">Edit Action</h2>
        <p id="editor-intro" className={styles.editorIntro}>
          {passive
            ? 'Edit this shared Action. State changes and card moves are unavailable in Views.'
            : 'Change the details below. To change state, close this card and drag it to another column.'}
        </p>
        {discard ? (
          <div className={styles.editorNotice} role="alert">
            <strong>Discard unsaved changes?</strong>
            <p>Your edits will be lost.</p>
            <div className={styles.formButtons}>
              <button type="button" onClick={close}>
                Discard changes
              </button>
              <button
                ref={continueButton}
                type="button"
                onClick={() => {
                  setDiscard(false);
                  afterClose.current = undefined;
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
            {passive && factsStale && (
              <p role="status" className={styles.editorNotice}>
                View data is not current. Refresh successfully before saving.
              </p>
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
            <PrerequisitePicker
              value={dependencies}
              original={baseline.depends_on}
              current={current}
              saved={current ?? baseline}
              sourceFactsStale={factsStale || !current}
              disabled={saving}
              dirty={manualDirty || dependencyDirty}
              refreshSource={refresh}
              onChange={setDependencies}
            >
              <label className={styles.manualToggle}>
                <input
                  type="checkbox"
                  checked={manual}
                  disabled={saving || !manualEligible}
                  onChange={(event) => setManual(event.target.checked)}
                />
                Manual block
              </label>
              {!manualEligible && (
                <p className={styles.hint}>
                  Completed and cancelled Actions cannot receive a manual
                  reason. Prerequisites remain editable.
                </p>
              )}
              {manual && (
                <>
                  <label htmlFor="manual-reason">Manual blocking reason</label>
                  <textarea
                    id="manual-reason"
                    rows={3}
                    value={manualReason}
                    disabled={saving || !manualEligible}
                    onChange={(event) => setManualReason(event.target.value)}
                  />
                </>
              )}
              {manualDirty && (
                <p role="status" className={styles.hint}>
                  {manual
                    ? 'Pending manual reason edit. Save to apply.'
                    : 'Saving will clear the manual block.'}
                </p>
              )}
            </PrerequisitePicker>
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
              <button
                type="submit"
                disabled={saving || blocked || stale || (passive && factsStale)}
              >
                Save changes
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => requestClose()}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
