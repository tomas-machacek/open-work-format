import { expect, test } from 'vitest';
import {
  editAction,
  newAction,
  projectAction,
  validateCompletion,
} from './index.js';

const action = newAction(
  { title: 'Source' },
  '00000000-0000-4000-8000-000000000001',
  '2026-10-15T10:00:00.000Z',
  '/',
);
const time = '2026-10-15T11:00:00.000Z';

test('manual reasons are literal, independent from state, and forbidden on terminal results', () => {
  const waiting = editAction(
    action,
    { state: 'waiting', waitingFor: 'Reply', manualBlock: '  No\naccess  ' },
    time,
  );
  expect(waiting).toMatchObject({
    waiting_for: 'Reply',
    manual_block: '  No\naccess  ',
  });
  expect(
    editAction(waiting, { manualBlock: waiting.manual_block }, 'unused'),
  ).toBe(waiting);
  for (const state of ['completed', 'cancelled']) {
    expect(() => editAction(waiting, { state }, time)).toThrow(
      /clear.*explicitly/i,
    );
    const terminal = editAction(
      waiting,
      { state, clearManualBlock: true },
      time,
    );
    expect(terminal).not.toHaveProperty('manual_block');
    expect(() =>
      editAction(terminal, { manualBlock: 'No access' }, time),
    ).toThrow();
    expect(editAction(terminal, { clearManualBlock: true }, 'unused')).toBe(
      terminal,
    );
    expect(
      editAction(terminal, { state: 'open', manualBlock: 'No access' }, time)
        .manual_block,
    ).toBe('No access');
  }
  for (const input of [
    { manualBlock: ' \t\n' },
    { manualBlock: 'Reason', clearManualBlock: true },
  ])
    expect(() => editAction(action, input, time)).toThrow(
      expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    );
});

test('self-edges and cycles evaluate direct disposition without recursive traversal', () => {
  const first = editAction(action, { addDependency: [action.id] }, time);
  expect(
    projectAction(first, () => first).blocking.unresolved_dependencies,
  ).toEqual([`owf:action:${action.id}`]);
  const other = newAction(
    { title: 'Other', state: 'completed' },
    '00000000-0000-4000-8000-000000000002',
    time,
    '/',
  );
  const source = editAction(
    first,
    { removeDependency: [action.id], addDependency: [other.id] },
    time,
  );
  const target = editAction(other, { addDependency: [source.id] }, time);
  expect(projectAction(target, () => source).blocking.blocked).toBe(true);
  expect(projectAction(source, () => target).blocking.blocked).toBe(false);
  const completed = projectAction(
    { ...source, state: 'completed' },
    () => target,
  );
  expect(() => validateCompletion(source, completed)).not.toThrow();
  const reopenedTarget = { ...target, state: 'open' as const };
  const blockedCompleted = projectAction(completed, () => reopenedTarget);
  expect(() => validateCompletion(completed, blockedCompleted)).not.toThrow();
  expect(() => validateCompletion(source, blockedCompleted)).toThrow(
    expect.objectContaining({ code: 'ACTION_BLOCKED' }),
  );
});
