import { expect, test } from 'vitest';
import { projectAction, type ActionState } from '../actions/index.js';
import { evaluateView, validateViewDefinition } from './index.js';

function action(id: string, state: ActionState = 'open', blocked = false) {
  return projectAction(
    {
      id,
      title: `Action ${id}`,
      state,
      owner: { url: '/' },
      created_at: '2026-10-22T00:00:00Z',
      updated_at: '2026-10-22T00:00:00Z',
      ...(blocked ? { manual_block: 'Reason' } : {}),
    },
    () => undefined,
  );
}
function definition(columns: unknown[], defaults = {}) {
  return validateViewDefinition({
    type: 'OWF View Definition',
    title: 'Board',
    owf: { renderer: 'kanban', columns, defaults },
  });
}
const first = { id: 'first', title: 'First', status: 'open' };
const alternate = {
  id: 'alternate',
  title: 'Alternate',
  status: ['open', 'in_progress'],
  default_status: 'in_progress',
  include_blocked: true,
};
const blocked = { id: 'blocked', title: 'Blocked', type: 'blocked' };

test('effective defaults uniquely route overlapping states; actual states ignore move defaults and cards use fixed ID order', () => {
  const actions = [
    action('b'),
    action('a'),
    action('Z'),
    action('c', 'in_progress'),
  ];
  const config = definition([first, alternate, blocked], { open: 'alternate' });
  const columns = evaluateView(config, actions);
  expect(columns).toEqual([
    { id: 'first', title: 'First', members: [] },
    {
      id: 'alternate',
      title: 'Alternate',
      members: ['Z', 'a', 'b', 'c'].map((id, index) => ({
        position: index + 1,
        id,
        title: `Action ${id}`,
        state: id === 'c' ? 'in_progress' : 'open',
        blocked: false,
      })),
    },
    { id: 'blocked', title: 'Blocked', members: [] },
  ]);
  expect(evaluateView(config, [...actions].reverse())).toEqual(columns);
  expect(
    evaluateView(definition([first, alternate]), actions)[0]!.members.map(
      (member) => member.id,
    ),
  ).toEqual(['Z', 'a', 'b']);
});

test('special Blocked wins for nonterminal Actions including omitted Waiting, while Waiting alone is outside', () => {
  const columns = evaluateView(definition([first, alternate, blocked]), [
    action('manual', 'open', true),
    action('waiting', 'waiting'),
    action('blocked-waiting', 'waiting', true),
  ]);
  expect(
    columns.map((column) => column.members.map((member) => member.id)),
  ).toEqual([[], [], ['blocked-waiting', 'manual']]);
});

test('ineligible default falls back to first eligible ordinary column; no eligible column excludes a member', () => {
  const actions = [action('b', 'open', true), action('a')];
  const columns = evaluateView(
    definition([first, alternate, { ...alternate, id: 'later' }]),
    actions,
  );
  expect(
    columns.map((column) => column.members.map((member) => member.id)),
  ).toEqual([['a'], ['b'], []]);
  expect(
    evaluateView(definition([first]), actions)[0]!.members.map(
      (member) => member.id,
    ),
  ).toEqual(['a']);
  expect(evaluateView(definition([first]), [])).toEqual([
    { id: 'first', title: 'First', members: [] },
  ]);
  expect(evaluateView(definition([]), actions)).toEqual([]);
});

test('terminal dependency blocking keeps its derived value and never enters special Blocked', () => {
  const prerequisite = action('00000000-0000-4000-8000-000000000001');
  const terminal = (state: ActionState) =>
    projectAction(
      {
        ...action(state, state),
        depends_on: [`owf:action:${prerequisite.id}`],
      },
      () => prerequisite,
    );
  const actions = [terminal('completed'), terminal('cancelled')];
  const ordinary = {
    id: 'terminal',
    title: 'Terminal',
    status: ['completed', 'cancelled'],
    include_blocked: true,
  };
  expect(
    evaluateView(definition([blocked, ordinary]), actions).map(
      (column) => column.members,
    ),
  ).toEqual([
    [],
    ['cancelled', 'completed'].map((state, index) => ({
      position: index + 1,
      id: state,
      title: `Action ${state}`,
      state,
      blocked: true,
    })),
  ]);
  expect(
    evaluateView(
      definition([blocked, { ...ordinary, include_blocked: false }]),
      actions,
    ).map((column) => column.members),
  ).toEqual([[], []]);
});
