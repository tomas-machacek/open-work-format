import { expect, test } from 'vitest';
import { validateTitle } from './index.js';

test('trim outer whitespace while preserving literal Unicode and punctuation', () => {
  expect(validateTitle('  Život: [a] # & <b>  ')).toBe('Život: [a] # & <b>');
});
test.each(['', '   ', 'a\nb', 'a\rb', 'a\u2028b'])(
  'reject unusable title %j',
  (title) => {
    expect(() => validateTitle(title)).toThrow('Title must be nonempty');
  },
);
