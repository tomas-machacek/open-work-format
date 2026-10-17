import { useEffect, useId, useState } from 'react';
import styles from './Board.module.css';

function displayOwner(url: string) {
  if (url === '/') return '';
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/** Identity disclosure, also reachable without hover on keyboards and touch. */
export function ActionIdentity({
  uri,
  title,
  owner,
  ownerStatus,
}: {
  uri: string;
  title: string;
  owner: string | undefined;
  ownerStatus?: string | undefined;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!visible && !pinned) return;
    // Hover may expose identity while focus is elsewhere in the editor. Escape
    // still dismisses this innermost disclosure before picker/dialog dismissal.
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setVisible(false);
      setPinned(false);
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [visible, pinned]);
  return (
    <div
      className={styles.targetIdentity}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <button
        type="button"
        className={styles.identityLabel}
        aria-label={`Identity for ${title}`}
        aria-describedby={visible || pinned ? id : undefined}
        aria-expanded={visible || pinned}
        onFocus={() => setVisible(true)}
        onBlur={() => {
          setVisible(false);
          setPinned(false);
        }}
        onClick={() => {
          setPinned(!pinned);
          setVisible(false);
        }}
      >
        {owner !== undefined && (
          <span className={styles.targetOwner}>{displayOwner(owner)} </span>
        )}
        <strong>{title}</strong>
        {ownerStatus && (
          <span className={styles.targetOwner}> · {ownerStatus}</span>
        )}
      </button>
      {(visible || pinned) && (
        <div id={id} role="tooltip" className={styles.identityDetails}>
          {uri}
          <br />
          Owner: {owner ?? 'unavailable'}
        </div>
      )}
    </div>
  );
}
