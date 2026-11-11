import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Board.module.css';

// The active board retains navigation guards; Workspace supplies the DOM position.
// Without a target, standalone boards keep their inline header.
export function WorkspaceHeader({
  target,
  children,
}: {
  target: HTMLElement | null | undefined;
  children: ReactNode;
}) {
  const header = (
    <header className={styles.header}>
      <span className={styles.brand}>
        owf <span>/ workspace</span>
      </span>
      {children}
    </header>
  );
  return target === undefined
    ? header
    : target === null
      ? null
      : createPortal(header, target);
}
