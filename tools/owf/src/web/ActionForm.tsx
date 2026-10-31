import type { ComponentProps } from 'react';
import { Notifications, useFeedback } from './Notifications.js';
import { useEffect, useRef, useState } from 'react';
import type { BoardAction, CreateActionRequest } from '../contracts/index.js';
import { OwnerPicker } from './OwnerPicker.js';
import { StateUpdateError } from './client.js';
import styles from './Board.module.css';

function ActionFormContent({
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
  const feedback = useFeedback();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('/');
  const [waitingFor, setWaitingFor] = useState('');
  const [validate, setValidate] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const saving = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => titleInput.current?.focus(), []);
  async function submit() {
    if (saving.current) return;
    feedback.clear();
    if (
      !title.trim() ||
      !owner.trim() ||
      (waitingFor !== '' && !waitingFor.trim())
    ) {
      setValidate(true);
      return;
    }
    saving.current = true;
    setPending(true);
    setValidate(false);
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
      feedback.report(
        `Create “${title}”: ${failure instanceof Error ? failure.message : 'Unable to save Action.'}`,
      );
      if (
        (failure instanceof StateUpdateError && failure.code === 'UNCERTAIN') ||
        (failure instanceof Error &&
          /could not be confirmed/.test(failure.message))
      )
        setUncertain(true);
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
        {validate && !title.trim() && (
          <p role="alert" className={styles.formError}>
            Enter a title.
          </p>
        )}
        <label htmlFor="action-description">
          Description <span>optional · Markdown</span>
        </label>
        <textarea
          id="action-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <OwnerPicker value={owner} onChange={setOwner} disabled={pending} />
        {validate && !owner.trim() && (
          <p role="alert" className={styles.formError}>
            Select an owner.
          </p>
        )}
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
            {validate && waitingFor !== '' && !waitingFor.trim() && (
              <p role="alert" className={styles.formError}>
                Waiting for must contain text when supplied.
              </p>
            )}
          </>
        )}
        <div className={styles.formButtons}>
          <button type="submit">{pending ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </fieldset>
      {pending && (
        <p className={styles.hint} role="status">
          Saving Action…
        </p>
      )}
      {uncertain && !pending && (
        <p className={styles.hint} role="status">
          Creation outcome unconfirmed. Refresh and inspect the board before
          deliberately submitting again.
        </p>
      )}
    </form>
  );
}

export function ActionForm(props: ComponentProps<typeof ActionFormContent>) {
  return (
    <Notifications>
      <ActionFormContent {...props} />
    </Notifications>
  );
}
