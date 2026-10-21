import { describe, expect, it } from 'vitest';
import { validateViewDefinition, validateViewInstance } from './index.js';

const column = { id: 'new', title: 'New', status: 'open' };
function definition(config: Record<string, unknown> = {}) {
  return {
    type: 'OWF View Definition',
    title: 'Board',
    description: 'Common metadata',
    tags: ['work'],
    owf: { renderer: 'kanban', columns: [column], ...config },
  };
}

describe('View definition profile', () => {
  it('resolves ordered overlapping state sets, ordinary defaults and blocking inclusion without requiring every state', () => {
    expect(
      validateViewDefinition(
        definition({
          id: 'shared-board',
          purpose: 'my-purpose',
          columns: [
            column,
            {
              id: 'active',
              title: 'Active',
              status: ['in_progress', 'open'],
              include_blocked: true,
            },
            { id: 'blocked', title: 'Blocked', type: 'blocked' },
          ],
          defaults: { open: 'active' },
        }),
      ),
    ).toEqual({
      title: 'Board',
      id: 'shared-board',
      purpose: 'my-purpose',
      renderer: 'kanban',
      columns: [
        {
          ...column,
          type: 'status',
          status: ['open'],
          default_status: 'open',
          include_blocked: false,
        },
        {
          id: 'active',
          title: 'Active',
          type: 'status',
          status: ['in_progress', 'open'],
          default_status: 'in_progress',
          include_blocked: true,
        },
        { id: 'blocked', title: 'Blocked', type: 'blocked' },
      ],
      defaults: { open: 'active', in_progress: 'active' },
    });
    expect(
      validateViewDefinition(
        definition({
          columns: [
            {
              ...column,
              status: ['completed', 'cancelled'],
              default_status: 'cancelled',
            },
          ],
        }),
      ).columns[0],
    ).toMatchObject({ default_status: 'cancelled' });
  });
  it.each([
    ['renderer', { renderer: 'table' }],
    ['unknown configuration', { filter: 'all' }],
    ['empty column id', { columns: [{ ...column, id: ' ' }] }],
    ['duplicate column id', { columns: [column, column] }],
    ['empty state list', { columns: [{ ...column, status: [] }] }],
    ['duplicate state', { columns: [{ ...column, status: ['open', 'open'] }] }],
    [
      'blocked as execution state',
      { columns: [{ ...column, status: 'blocked' }] },
    ],
    ['unsupported type', { columns: [{ ...column, type: 'manual' }] }],
    [
      'target state outside column',
      { columns: [{ ...column, default_status: 'waiting' }] },
    ],
    [
      'nonboolean inclusion',
      { columns: [{ ...column, include_blocked: 'true' }] },
    ],
    [
      'unknown column field',
      { columns: [{ ...column, on_enter: 'complete' }] },
    ],
    [
      'multiple blocked columns',
      {
        columns: [
          { id: 'b', title: 'B', type: 'blocked' },
          { id: 'c', title: 'C', type: 'blocked' },
        ],
      },
    ],
    ['blocked status', { columns: [{ ...column, type: 'blocked' }] }],
    [
      'blocked default',
      {
        columns: [
          { id: 'b', title: 'B', type: 'blocked', default_status: 'open' },
        ],
      },
    ],
    [
      'blocked inclusion',
      {
        columns: [
          { id: 'b', title: 'B', type: 'blocked', include_blocked: false },
        ],
      },
    ],
    ['unknown default state', { defaults: { blocked: 'new' } }],
    ['unknown default column', { defaults: { open: 'missing' } }],
    ['default does not support state', { defaults: { completed: 'new' } }],
    [
      'default points at blocked',
      {
        columns: [{ id: 'b', title: 'B', type: 'blocked' }],
        defaults: { open: 'b' },
      },
    ],
    ['null optional value', { purpose: null }],
  ])('rejects %s', (_name, config) => {
    expect(() => validateViewDefinition(definition(config))).toThrow(
      /Invalid View definition field/u,
    );
  });
  it('validates stored instance integrity independently of definition files', () => {
    const instance = {
      id: '033105d4-bf5b-4fb3-b1b1-a59bce021166',
      title: 'My board',
      definition: { url: '/_views/shared%20board.md', id: 'shared' },
      created_at: '2026-10-21T12:00:00.000Z',
    };
    expect(validateViewInstance(instance)).toEqual(instance);
    expect(
      validateViewInstance({
        ...instance,
        definition: { url: '/_views/board%2Emd' },
      }).definition.url,
    ).toBe('/_views/board%2Emd');
    for (const changed of [
      { id: 'invalid' },
      { title: ' padded ' },
      { created_at: 'yesterday' },
      { created_at: '2026-02-31T12:00:00.000Z' },
      { definition: { url: '/_views/%2e%2e/outside.md' } },
      { definition: { url: '/_views/index%2Emd' } },
      { definition: { url: '/_views/x.md%3Astream.md' } },
      { definition: { url: '/_views/x.md', window: {} } },
    ])
      expect(() => validateViewInstance({ ...instance, ...changed })).toThrow(
        /stored View instance/u,
      );
  });
});
