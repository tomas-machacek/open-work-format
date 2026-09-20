import { expect, test } from 'vitest';
import {
  ownerType,
  prepareContext,
  validateOwner,
  validateSlug,
  type ContextMetadata,
} from './index.js';

test('NFKD slug derivation keeps literal title and explicit slug precedence', () => {
  expect(
    prepareContext({ type: 'project', title: ' Rekonštrukcia kuchyne ' }),
  ).toMatchObject({
    title: 'Rekonštrukcia kuchyne',
    slug: 'rekonstrukcia-kuchyne',
  });
  expect(
    prepareContext({ type: 'outcome', title: '中文', slug: 'result' }),
  ).toMatchObject({ slug: 'result', expectedResult: '中文' });
});
test.each([
  '',
  'Uppercase',
  'con',
  'lpt9',
  'com1',
  '_archive',
  'two words',
  '../x',
  'a/b',
  'a%20b',
  '-a',
  'a--b',
  'a-',
])('reject nonportable slug %s', (slug) => {
  expect(() => validateSlug(slug)).toThrow(
    expect.objectContaining({ code: 'INVALID_SLUG' }),
  );
});
test.each([
  [{ title: '中文' }, 'INVALID_SLUG'],
  [{ title: '\nTitle' }, 'INVALID_TITLE'],
  [{ title: 'Title', expectedResult: ' ' }, 'INVALID_EXPECTED_RESULT'],
  [{ title: 'Title', expectedResult: 'one\ntwo' }, 'INVALID_EXPECTED_RESULT'],
])('reject invalid context input', (input, code) => {
  expect(() => prepareContext({ type: 'outcome', ...input })).toThrow(
    expect.objectContaining({ code }),
  );
});
const metadata: ContextMetadata = {
  type: 'OWF Outcome',
  title: 'Result',
  state: 'active',
  expectedResult: 'Something real',
};
test.each([
  { state: 'completed' },
  { state: 'archived', archivedFrom: 'achieved' },
  { state: 'parked' },
  { parkingReason: 'Not parked' },
  { reviewAfter: '2026-10-01' },
  { archivedFrom: 'achieved' },
  { expectedResult: ' ' },
  { type: 'OWF Project' },
  { title: '' },
  { state: 'parked', parkingReason: 'Budget', reviewAfter: 42 },
])('owner rejects inconsistent metadata %j', (change) => {
  expect(() => validateOwner({ ...metadata, ...change }, 'outcome')).toThrow(
    expect.objectContaining({ code: 'INVALID_OWNER' }),
  );
});
test('parked and terminal owners remain usable without changing parent state', () => {
  expect(() =>
    validateOwner(
      { ...metadata, type: 'OWF Project', state: 'completed' },
      'project',
    ),
  ).not.toThrow();
  expect(() =>
    validateOwner(
      { ...metadata, type: 'OWF Project', state: 'achieved' },
      'project',
    ),
  ).toThrow(expect.objectContaining({ code: 'INVALID_OWNER' }));
  expect(() =>
    validateOwner(
      {
        ...metadata,
        state: 'parked',
        parkingReason: 'Budget',
        reviewAfter: 'Next quarter',
      },
      'outcome',
    ),
  ).not.toThrow();
  expect(() =>
    validateOwner({ ...metadata, state: 'achieved' }, 'outcome'),
  ).not.toThrow();
});
test.each(
  [
    [],
    ['elsewhere', 'project'],
    ['_projects', '_archive', 'project'],
    ['_projects', 'project', '_notes'],
  ].map((segments) => ({ segments })),
)('reject invalid structural owner $segments', ({ segments }) => {
  expect(() => ownerType(segments)).toThrow();
});
