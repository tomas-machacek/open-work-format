import { expect, test } from 'vitest';
import { projectAction } from '../actions/index.js';
import {
  evaluateView,
  insertViewMember,
  recordViewOrder,
  validatePosition,
  validateViewDefinition,
} from './index.js';

const definition = validateViewDefinition({
  type: 'OWF View Definition',
  title: 'Order',
  owf: {
    renderer: 'kanban',
    columns: [
      { id: 'new', title: 'New', status: 'open' },
      { id: 'todo', title: 'Todo', status: 'open' },
    ],
  },
});
const actions = ['A', 'B', 'C', 'D'].map((id) =>
  projectAction(
    {
      id,
      title: id,
      state: 'open',
      owner: { url: '/' },
      created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z',
    },
    () => undefined,
  ),
);

test.each([
  ['D', 3, ['A', 'B', 'D', 'C']],
  ['B', 3, ['A', 'C', 'B', 'D']],
  ['D', 1, ['D', 'A', 'B', 'C']],
  ['A', 4, ['B', 'C', 'D', 'A']],
  ['C', 3, ['A', 'B', 'C', 'D']],
])(
  'final-index insertion of %s at %i preserves all other relative order',
  (id, position, expected) => {
    const columns = evaluateView(definition, actions);
    expect(insertViewMember(columns, id, 'new', position)).toBe(position);
    expect(columns[0]!.members.map((member) => member.id)).toEqual(expected);
    expect(columns[0]!.members.map((member) => member.position)).toEqual([
      1, 2, 3, 4,
    ]);
  },
);

test('entry into empty column allows only one; out-of-bounds and unsafe domain input fail', () => {
  const placements = [{ view_id: 'v', action_id: 'D', column_id: 'todo' }];
  const columns = evaluateView(definition, actions, placements);
  expect(insertViewMember(columns, 'D', 'todo', 1)).toBe(1);
  for (const position of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    2,
  ])
    expect(() => validatePosition(position, 1)).toThrow();
});

test('routing dominates order and contradictory persisted entries fail explicitly', () => {
  const stored = recordViewOrder(
    'v',
    evaluateView(definition, actions),
  ).reverse();
  stored.forEach((row, index) => {
    row.rank = index + 1;
  });
  const columns = evaluateView(definition, actions, [], stored);
  expect(columns[0]!.members.map((member) => member.id)).toEqual([
    'D',
    'C',
    'B',
    'A',
  ]);
  const partial = evaluateView(
    definition,
    actions,
    [],
    stored.filter((row) => ['D', 'B'].includes(row.action_id)),
  );
  expect(partial[0]!.members.map((member) => member.id)).toEqual([
    'D',
    'B',
    'A',
    'C',
  ]);
  const external = evaluateView(
    definition,
    actions,
    [{ view_id: 'v', action_id: 'D', column_id: 'todo' }],
    stored,
  );
  expect(external[0]!.members.map((member) => member.id)).toEqual([
    'C',
    'B',
    'A',
  ]);
  expect(external[1]!.members[0]!.position).toBe(1);
  for (const corrupt of [
    [...stored, stored[0]!],
    [{ ...stored[0]!, action_id: 'missing' }],
    [{ ...stored[0]!, rank: 0 }],
    [{ ...stored[0]!, column_id: 'removed' }],
    [stored[0]!, { ...stored[1]!, rank: stored[0]!.rank }],
  ])
    expect(() => evaluateView(definition, actions, [], corrupt)).toThrow();
});
