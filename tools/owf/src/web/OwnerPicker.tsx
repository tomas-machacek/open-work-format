import { useEffect, useId, useRef, useState } from 'react';
import type { AvailableOwner } from '../contracts/index.js';
import { fetchOwners } from './client.js';
import styles from './Board.module.css';

export function OwnerPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [owners, setOwners] = useState<AvailableOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(undefined);
    setActive(-1);
    void fetchOwners()
      .then((result) => {
        if (current) setOwners(result);
      })
      .catch((failure: unknown) => {
        if (current)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to read owners.',
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [revision]);
  const selected = owners.find((owner) => owner.url === value);
  const matches = owners.filter((owner) =>
    `${owner.title} ${owner.type} ${owner.hierarchy} ${owner.url}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const available = !loading && !error;
  function choose(owner: AvailableOwner) {
    onChange(owner.url);
    input.current?.focus();
    setOpen(false);
    setQuery('');
    setActive(-1);
  }
  return (
    <div
      className={styles.ownerPicker}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={id}>Owner</label>
      <p className={styles.ownerSelected} aria-live="polite">
        Selected:{' '}
        {selected
          ? `${selected.title} · ${selected.type}`
          : value === '/'
            ? 'Workspace'
            : value}
        <span>
          {selected?.hierarchy} · {value}
        </span>
      </p>
      {available && !selected && (
        <p className={styles.hint}>
          Selected owner is unavailable. It is retained until you choose another
          owner.
        </p>
      )}
      <input
        ref={input}
        id={id}
        role="combobox"
        autoComplete="off"
        placeholder="Search owners…"
        value={query}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-autocomplete="list"
        aria-describedby={`${id}-status`}
        aria-activedescendant={
          open && available && matches[active]
            ? `${id}-option-${active}`
            : undefined
        }
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (available && matches.length) {
              const next =
                event.key === 'ArrowDown'
                  ? (active + 1) % matches.length
                  : (active <= 0 ? matches.length : active) - 1;
              setActive(next);
              document
                .getElementById(`${id}-option-${next}`)
                ?.scrollIntoView?.({ block: 'nearest' });
            }
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            const owner = matches[active];
            if (available && owner) choose(owner);
          }
        }}
      />
      <div id={`${id}-status`} className={styles.hint} role="status">
        {loading
          ? 'Loading owners…'
          : error
            ? 'Owners could not be loaded. Your selection is retained.'
            : `${matches.length} ${matches.length === 1 ? 'owner' : 'owners'} found${matches.length ? '.' : ' · No matches.'}`}
      </div>
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={styles.ownerRefresh}
        disabled={disabled || loading}
        onClick={() => setRevision((previous) => previous + 1)}
      >
        {error ? 'Retry owners' : 'Refresh owners'}
      </button>
      {open && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label="Available owners"
          className={styles.ownerOptions}
        >
          {available &&
            matches.map((owner, index) => (
              <li key={owner.url} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${id}-option-${index}`}
                  tabIndex={-1}
                  aria-selected={owner.url === value}
                  disabled={disabled}
                  className={active === index ? styles.ownerActive : undefined}
                  onClick={() => choose(owner)}
                >
                  <strong>{owner.title}</strong> <span>{owner.type}</span>
                  <small>{owner.hierarchy}</small>
                  <small>{owner.url}</small>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
