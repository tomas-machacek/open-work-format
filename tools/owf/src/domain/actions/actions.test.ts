import { expect, test } from 'vitest';
import {
  actionId,
  validateActionOwner,
  actionStates,
  newAction,
  changeActionState,
} from './index.js';

const original = newAction(
  { title: 'Work', description: 'Literal' },
  '00000000-0000-4000-8000-000000000001',
  '2026-09-20T10:00:00.000Z',
  '/',
);
const later = '2026-09-21T10:00:00.000Z';
test('all five states can transition to each other, preserving identity and clearing waiting context', () => {
  for (const from of actionStates) {
    const current = changeActionState(
      original,
      { state: from, ...(from === 'waiting' ? { waitingFor: 'Reply' } : {}) },
      original.created_at,
    );
    for (const to of actionStates) {
      const changed = changeActionState(current, { state: to }, later);
      expect(changed).toEqual({
        ...original,
        state: to,
        updated_at: from === to ? original.updated_at : later,
        ...(from === 'waiting' && to === 'waiting'
          ? { waiting_for: 'Reply' }
          : {}),
      });
      if (from === to) expect(changed).toBe(current);
    }
  }
});
test('waiting reasons are optional, literal, editable and idempotent when omitted or equal', () => {
  const waiting = changeActionState(original, { state: 'waiting' }, later);
  expect(waiting).not.toHaveProperty('waiting_for');
  const reason = "  Život\n' reply  ";
  const explained = changeActionState(
    waiting,
    { state: 'waiting', waitingFor: reason },
    later,
  );
  expect(explained.waiting_for).toBe(reason);
  expect(changeActionState(explained, { state: 'waiting' }, 'unused')).toBe(
    explained,
  );
  expect(
    changeActionState(
      explained,
      { state: 'waiting', waitingFor: reason },
      'unused',
    ),
  ).toBe(explained);
  expect(
    changeActionState(explained, { state: 'waiting', waitingFor: 'New' }, later)
      .waiting_for,
  ).toBe('New');
});
test.each([
  { state: 'archived' },
  { state: 'open,waiting' },
  { state: 'blocked' },
  { state: 'waiting', waitingFor: '\t\n ' },
  { state: 'open', waitingFor: 'Reply' },
])('rejects invalid state request %j', (input) => {
  expect(() => changeActionState(original, input, later)).toThrow(
    expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
  );
  expect(original.state).toBe('open');
});

test.each(['completed', 'achieved', 'abandoned', 'archived'])(
  'Actions reject %s anywhere in ownership chain',
  (state) => {
    const owner = {
      type: 'OWF Project',
      title: 'Owner',
      state,
      expectedResult: '',
    };
    expect(() =>
      validateActionOwner([owner, { ...owner, state: 'active' }]),
    ).toThrow(expect.objectContaining({ code: 'INVALID_OWNER' }));
  },
);
test.each([
  'owf:outcome:00000000-0000-4000-8000-000000000000',
  '00000000-0000-1000-8000-000000000000',
  '00000000-0000-4000-7000-000000000000',
  'owf:action:00000000-0000-4000-8000-000000000000?x',
  'owf:action:00000000-0000-4000-8000-000000000000#x',
  ' 00000000-0000-4000-8000-000000000000',
])('reject invalid identity %s', (input) => {
  expect(() => actionId(input)).toThrow(
    expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
  );
});
