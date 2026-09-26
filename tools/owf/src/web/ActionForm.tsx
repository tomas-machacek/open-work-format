import { useEffect, useRef, useState } from 'react';
import type { BoardAction, CreateActionRequest } from '../contracts/index.js';
import styles from './Board.module.css';

export function ActionForm({
  state,
  label,
  save,
  onSaved,
  onClose,
}: {
  state: BoardAction['state'];
  label: string;
  save: (input: CreateActionRequest) => Promise<BoardAction>;
  onSaved: (action: BoardAction) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('/');
  const [waitingFor, setWaitingFor] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => titleInput.current?.focus(), []);
  async function submit() {
    if (saving.current) return;
    if (
      !title.trim() ||
      !owner.trim() ||
      (waitingFor !== '' && !waitingFor.trim())
    ) {
      setError(
        'Enter a title and owner URL. Waiting for must contain text when supplied.',
      );
      return;
    }
    saving.current = true;
    setPending(true);
    setError(undefined);
    try {
      const action = await save({
        title,
        owner,
        state,
        ...(description === '' ? {} : { description }),
        ...(state !== 'waiting' || waitingFor === '' ? {} : { waitingFor }),
      });
      onSaved(action);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Unable to save Action.',
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  return (
    <form
      className={styles.form}
      aria-label={`Add Action to ${label}`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className={styles.formTitle}>
        New Action <span>in {label}</span>
      </p>
      <fieldset disabled={pending}>
        <label htmlFor="action-title">Title</label>
        <input
          ref={titleInput}
          id="action-title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label htmlFor="action-description">
          Description <span>optional · Markdown</span>
        </label>
        <textarea
          id="action-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label htmlFor="action-owner">Owner URL</label>
        <input
          id="action-owner"
          required
          value={owner}
          aria-describedby="owner-hint"
          onChange={(e) => setOwner(e.target.value)}
        />
        <p id="owner-hint" className={styles.hint}>
          / for Workspace, or a Project/Outcome URL such as /_projects/launch/
        </p>
        {state === 'waiting' && (
          <>
            <label htmlFor="action-waiting">
              Waiting for <span>optional</span>
            </label>
            <textarea
              id="action-waiting"
              rows={2}
              value={waitingFor}
              onChange={(e) => setWaitingFor(e.target.value)}
            />
          </>
        )}
        <div className={styles.formButtons}>
          <button type="submit">{pending ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </fieldset>
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      {pending && (
        <p className={styles.hint} role="status">
          Saving Action…
        </p>
      )}
    </form>
  );
}
