const layers = [
  'domain',
  'application',
  'infrastructure',
  'interfaces',
  'contracts',
  'bootstrap',
  'web',
];
const allowed = {
  domain: ['domain'],
  application: ['domain', 'application'],
  infrastructure: ['domain', 'application', 'infrastructure'],
  interfaces: ['application', 'contracts', 'interfaces'],
  contracts: ['contracts'],
  bootstrap: layers,
  web: ['contracts', 'web'],
};

module.exports = {
  forbidden: [
    {
      name: 'no-production-cycles',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolved',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    ...Object.entries(allowed)
      .map(([layer, dependencies]) => ({
        name: `${layer}-dependencies`,
        severity: 'error',
        from: { path: `^src/${layer}/` },
        to: {
          path: `^src/(${layers.filter((value) => !dependencies.includes(value)).join('|')})/`,
        },
      }))
      .filter((rule) => rule.to.path !== '^src/()/'),
    {
      name: 'domain-no-external',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'application-no-external',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { pathNot: '^src/(domain|application)/' },
    },
    {
      name: 'sqlite-only-in-persistence-adapter',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/sqlite/' },
      to: { path: '^(node:)?sqlite$' },
    },
    {
      name: 'adapters-only-ports',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: {
        path: '^src/application/',
        pathNot: '^src/application/ports/index.ts$',
      },
    },
    ...['configuration', 'markdown', 'sqlite'].map((adapter) => ({
      name: `${adapter}-adapter-isolation`,
      severity: 'error',
      from: { path: `^src/infrastructure/${adapter}/` },
      to: {
        path: '^src/infrastructure/',
        pathNot: `^src/infrastructure/${adapter}/`,
      },
    })),
    ...layers
      .map((layer) => ({
        name: `${layer}-public-exports`,
        severity: 'error',
        from: { path: '^src/', pathNot: `^src/${layer}/` },
        to: { path: `^src/${layer}/`, pathNot: '/index.ts$' },
      }))
      .filter((rule) => rule.name !== 'bootstrap-public-exports'),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      conditionNames: ['import', 'node', 'default'],
    },
  },
};
