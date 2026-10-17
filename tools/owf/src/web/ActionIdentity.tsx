import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
  const label = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const disclosed = visible || pinned;
  useLayoutEffect(() => {
    const tooltip = details.current;
    const trigger = label.current;
    if (!disclosed || !tooltip || !trigger) return;
    // A manual popover escapes the result list's clipping without adding a
    // second modal or changing row geometry, focus, or either scroll position.
    tooltip.showPopover?.();
    const position = () => {
      const dialog = trigger.closest('dialog')?.getBoundingClientRect();
      const bounds = {
        left: Math.max(8, (dialog?.left ?? 0) + 8),
        right: Math.min(
          window.innerWidth - 8,
          (dialog?.right ?? window.innerWidth) - 8,
        ),
        top: Math.max(8, (dialog?.top ?? 0) + 8),
        bottom: Math.min(
          window.innerHeight - 8,
          (dialog?.bottom ?? window.innerHeight) - 8,
        ),
      };
      tooltip.style.maxWidth = `${Math.min(420, bounds.right - bounds.left)}px`;
      tooltip.style.maxHeight = 'none';
      const anchor = trigger.getBoundingClientRect();
      if (
        anchor.height &&
        (anchor.bottom <= bounds.top || anchor.top >= bounds.bottom)
      ) {
        setVisible(false);
        setPinned(false);
        return;
      }
      const size = tooltip.getBoundingClientRect();
      const below = Math.max(0, bounds.bottom - anchor.bottom);
      const above = Math.max(0, anchor.top - bounds.top);
      const placeBelow = below >= size.height || below >= above;
      const available = placeBelow ? below : above;
      const height = Math.min(size.height, available);
      const cramped = available < Math.min(size.height, 40);
      tooltip.style.maxHeight = `${cramped ? bounds.bottom - bounds.top : available}px`;
      tooltip.style.left = `${Math.max(bounds.left, Math.min(anchor.left, bounds.right - size.width))}px`;
      tooltip.style.top = `${cramped ? bounds.top : placeBelow ? anchor.bottom : anchor.top - height}px`;
    };
    const onScroll = (event: Event) => {
      if (event.target !== tooltip) position();
    };
    position();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', position);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', position);
    };
  }, [disclosed, uri, owner, title, ownerStatus]);
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
        ref={label}
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
        <div
          ref={details}
          id={id}
          role="tooltip"
          popover="manual"
          className={styles.identityDetails}
        >
          {uri}
          <br />
          Owner: {owner ?? 'unavailable'}
        </div>
      )}
    </div>
  );
}
