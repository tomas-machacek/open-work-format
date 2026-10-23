import type { ReactNode, RefObject } from 'react';
import type { StoredView } from '../contracts/index.js';
import type { EditorNavigation } from './ActionEditor.js';
import styles from './Board.module.css';

export type BoardNavigation = (
  guard: RefObject<EditorNavigation | null>,
  disabled?: boolean,
) => ReactNode;

export function ViewSelector({
  views,
  selected,
  onChange,
  disabled = false,
}: {
  views: StoredView[];
  selected: StoredView | undefined;
  onChange: (view: StoredView | undefined) => void;
  disabled?: boolean;
}) {
  const options =
    selected && !views.some((view) => view.id === selected.id)
      ? [...views, selected]
      : views;
  return (
    <label className={styles.viewSelector}>
      Display
      <select
        aria-label="Display"
        value={selected?.id ?? ''}
        disabled={disabled}
        onChange={(event) =>
          onChange(options.find((view) => view.id === event.target.value))
        }
      >
        <option value="">Default Kanban</option>
        {options.map((view) => (
          <option key={view.id} value={view.id}>
            {view.title}
            {options.filter((item) => item.title === view.title).length > 1
              ? ` · ${view.id}`
              : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
