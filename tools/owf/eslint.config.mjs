import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.test-artifacts/**'] },
  eslint.configs.recommended,
  { files: ['*.cjs'], languageOptions: { globals: { module: 'readonly' } } },
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],
      'no-debugger': 'error',
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'process',
        'fetch',
        'crypto',
        'Date',
        'performance',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random' },
        { object: 'globalThis', property: 'Date' },
        { object: 'globalThis', property: 'process' },
        { object: 'globalThis', property: 'crypto' },
        { object: 'globalThis', property: 'fetch' },
      ],
    },
  },
  prettier,
);
