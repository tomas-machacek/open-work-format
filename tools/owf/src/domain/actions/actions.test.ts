import { expect, test } from 'vitest';
import { actionId, validateActionOwner } from './index.js';

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
