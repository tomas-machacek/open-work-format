import { expect, test } from 'vitest';
import { projectAction, type ActionState } from '../actions/index.js';
import {
  evaluateView,
  moveViewAction,
  validateViewDefinition,
  type MoveActionInput,
  type ViewPlacement,
} from './index.js';

const definition = validateViewDefinition({
  type: 'OWF View Definition',
  title: 'Board',
  owf: {
    renderer: 'kanban',
    columns: [
      { id: 'new', title: 'New', status: 'open' },
      { id: 'todo', title: 'Todo', status: 'open' },
      {
        id: 'active',
        title: 'Active',
        status: ['in_progress', 'waiting'],
        include_blocked: true,
      },
      { id: 'waiting', title: 'Waiting', status: 'waiting' },
      { id: 'waiting2', title: 'Waiting again', status: ['waiting', 'open'] },
      { id: 'blocked', title: 'Blocked', type: 'blocked' },
      {
        id: 'cancelled',
        title: 'Cancelled',
        status: 'cancelled',
        include_blocked: true,
      },
    ],
  },
});
const time = '2026-10-27T10:00:00.000Z';
function action(state: ActionState = 'open', manual?: string, reason?: string) {
  return projectAction(
    {
      id: 'a',
      title: 'Work',
      state,
      owner: { url: '/' },
      created_at: time,
      updated_at: time,
      ...(manual ? { manual_block: manual } : {}),
      ...(reason ? { waiting_for: reason } : {}),
    },
    () => undefined,
  );
}
function move(
  current = action(),
  column = 'todo',
  options: Partial<MoveActionInput> = {},
  placements: ViewPlacement[] = [],
) {
  return moveViewAction(
    definition,
    [current],
    placements,
    current,
    { view: 'v', column, ...options },
    time,
  );
}
const placement = (column_id: string): ViewPlacement[] => [
  { view_id: 'v', action_id: 'a', column_id },
];

test('ordinary organization preserves identity and timestamp; cross-column defaults differ from same-column no-op', () => {
  const current = action();
  expect(move(current)).toMatchObject({
    source: 'new',
    changed: true,
    action: current,
  });
  expect(move(action('waiting'), 'active')).toMatchObject({
    source: 'active',
    changed: false,
    action: { state: 'waiting' },
  });
  expect(move(current, 'active').action.state).toBe('in_progress');
  expect(move(action('completed'), 'todo')).toMatchObject({
    source: null,
    action: { state: 'open' },
  });
});

test('Blocked requires a manual reason, preserves Waiting metadata, reuses an existing reason and rejects terminal entry', () => {
  expect(
    move(action('waiting', undefined, 'Reply'), 'blocked', { reason: 'Access' })
      .action,
  ).toMatchObject({
    state: 'waiting',
    waiting_for: 'Reply',
    manual_block: 'Access',
  });
  expect(
    move(action('in_progress', 'Existing'), 'blocked').action.manual_block,
  ).toBe('Existing');
  for (const current of [action(), action('completed'), action('cancelled')])
    expect(() => move(current, 'blocked')).toThrow();
  expect(() =>
    move(action('in_progress', 'Existing'), 'blocked', { reason: ' \t' }),
  ).toThrow();
  expect(() =>
    move(action('completed'), 'blocked', { reason: 'Access' }),
  ).toThrow();
});

test('Blocked exit cannot bypass unresolved dependencies through include_blocked or terminal defaults', () => {
  const current = action('open', 'Access');
  current.blocking.unresolved_dependencies = ['owf:action:target'];
  for (const column of ['active', 'cancelled', 'waiting'])
    expect(() =>
      move(
        current,
        column,
        column === 'waiting' ? { waitingFor: 'Reply' } : {},
      ),
    ).toThrow(/prerequisite/);
  expect(
    move(action('waiting', 'Access', 'Old'), 'waiting', {
      waitingFor: '  New\nŽivot  ',
    }).action,
  ).toMatchObject({ state: 'waiting', waiting_for: '  New\nŽivot  ' });
  expect(
    move(action('waiting', 'Access'), 'waiting').action,
  ).not.toHaveProperty('manual_block');
});

test('ordinary moves retain manual blocks and enforce final eligibility and terminal rules', () => {
  const current = action('in_progress', 'Access');
  expect(move(current, 'active', {}, placement('active')).changed).toBe(false);
  expect(() => move(current, 'todo', {}, placement('active'))).toThrow(
    /eligible/,
  );
  expect(() => move(current, 'cancelled', {}, placement('active'))).toThrow(
    /manual block/,
  );
});

test('Waiting entry, literal replacement, preservation and cleanup use the effective default', () => {
  expect(move(action(), 'waiting').action).not.toHaveProperty('waiting_for');
  expect(
    move(action(), 'waiting', { waitingFor: '  Reply\nŽivot  ' }).action
      .waiting_for,
  ).toBe('  Reply\nŽivot  ');
  const current = action('waiting', undefined, 'Old');
  expect(move(current, 'waiting2').action.waiting_for).toBe('Old');
  expect(
    move(current, 'waiting2', { waitingFor: 'New' }).action.waiting_for,
  ).toBe('New');
  expect(move(current, 'todo').action).not.toHaveProperty('waiting_for');
});

test.each([
  ['todo', { waitingFor: 'Reply' }],
  ['active', { waitingFor: 'Reply' }],
  ['blocked', { waitingFor: 'Reply', reason: 'Access' }],
  ['waiting', { waitingFor: '\t\n' }],
  ['new', { waitingFor: 'Reply' }],
  ['new', { reason: 'Access' }],
  ['todo', { reason: 'Access' }],
] as const)(
  'inapplicable or blank semantic options fail for %s',
  (column, options) => {
    expect(() => move(action(), column, options)).toThrow();
  },
);

test('same-column Waiting and Blocked requests reject reason edits', () => {
  expect(() =>
    move(
      action('waiting'),
      'waiting',
      { waitingFor: 'New' },
      placement('waiting'),
    ),
  ).toThrow(/Same-column/);
  expect(() =>
    move(action('open', 'Access'), 'blocked', { reason: 'New' }),
  ).toThrow(/Same-column/);
});

test('eligible ordinary include_blocked placement wins; reads ignore ineligibility but reject removed columns', () => {
  const current = action('in_progress', 'Access');
  expect(
    evaluateView(definition, [current], placement('active')).find(
      (column) => column.id === 'active',
    )?.members,
  ).toHaveLength(1);
  expect(
    evaluateView(definition, [current], placement('todo')).find(
      (column) => column.id === 'blocked',
    )?.members,
  ).toHaveLength(1);
  expect(() =>
    evaluateView(definition, [current], placement('removed')),
  ).toThrow(/referenced column removed/);
});
