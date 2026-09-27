import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { BoardAction } from '../contracts/index.js';
import styles from './Board.module.css';

export function BoardColumn({
  state,
  title,
  children,
}: {
  state: BoardAction['state'];
  title: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={`${styles.column} ${isOver ? styles.dropTarget : ''}`}
      data-state={state}
    >
      {children}
    </section>
  );
}
